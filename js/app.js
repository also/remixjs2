(function () {

var Remix = this.Remix = {};

Remix.Loader = function () {};

_.extend(Remix.Loader.prototype, {
    loadFromFile: function (file) {
        this.file = file;
        var reader = new FileReader();
        reader.onloadend = _.bind(this._fileLoaded, this);
        reader.readAsArrayBuffer(file);
        reader.onprogress = this.onprogress;
        this._reader = reader;
    },

    _fileLoaded: function (e) {
        e.loader = this;
        this.onload(e.target.result, this.file.type, this.file.name);
    },

    loadFromUrl: function (url) {
        this._url = url;
        var request = new XMLHttpRequest();
        request.open('GET', url, true);
        request.responseType = 'arraybuffer';
        request.onload = _.bind(this._urlLoaded, this);
        request.onprogress = this.onprogress;
        request.send();
        this._request = request;
    },

    _urlLoaded: function (e) {
        e.loader = this;
        this.onload(e.target.response, e.target.getResponseHeader('Content-Type'), this._url.split('/').slice(-1)[0]);
    }
});

Remix.Track = function () {};

Remix.Track.prototype = {
    _onFileLoad: function (buffer, type, name) {
        var buffer = this._remix._audioContext.createBuffer(buffer, false);
        this.buffer = buffer;
        this.type = type;
        this.name = name;
    },
    
    analyze: function () {
        var md5worker = new Worker(Remix.path + '/md5.js');
        md5worker.onmessage = _.bind(this._onMd5Complete, this);
        md5worker.postMessage(this.file);
        this._analyzeRequest = this._remix._nest.analyzeFile(this.file, this._remix._nest.guessType(this.file), {
             onload: _.bind(this._onAnalyzeLoad, this),
             onerror: _.bind(this._onAnalyzeError, this)
        });
    },

    _onMd5Complete: function (e) {
        this._profileRequest = this._remix._nest.getTrackProfile(e.data, {
            onload: _.bind(this._onProfileLoad, this),
            onerror: _.bind(this._onProfileError, this)
        });
    },

    _onProfileLoad: function (result) {
        if (result.response.track.status == 'complete') {
            this._setProfile(result.response.track);
            this._analyzeRequest.abort();
        }
    },

    _setProfile: function (profile) {
        this._analysisTrack = profile;
        this._remix._nest.loadAnalysis(profile.audio_summary.analysis_url, {
            onload: _.bind(this._onAnalysisLoad, this),        
            onerror: _.bind(this._onAnalysisError, this)
        });
    },
    
    _onProfileError: function (e) {
        // FIXME
        console.log('profile error', e);
    },

    _onAnalyzeLoad: function (result) {
        this._setProfile(result.response.track);
    },

    _onAnalyzeError: function (e) {
        // FIXME
        console.log('analyze error', e);
    },

    _onAnalysisLoad: function (analysis) {
        console.log('analysis loaded');
        this.analysis = analysis;
    },

    _onAnalysisError: function (e) {
        // FIXME
        console.log('analysis error', e);
    },

    toUser: function () {
        var analysis = null;
        if (this.analysis) {
            analysis = new AudioAnalysis(this.analysis);
            analysis._source = new AudioBufferSampleSource(this.buffer);
        }
        return {
            analysis: analysis
        };
    }
}

Remix.Manager = function () {};

var JSLINT_OPTIONS = {debug: true, evil: true, laxbreak: true, forin: true, sub: true, css: true, cap: true, on: true, fragment: true};

Remix.validateJs = function (js) {
    if (!JSLINT(js, JSLINT_OPTIONS)) {
        return JSLINT.errors.filter(function (error) {
            return error && error.raw && error.raw.indexOf("Expected ';'") !== 0;
        });
    }
    else {
        return [];
    }
};

Remix.Editor = function (elt, content) {
    var editor = new CodeMirror(function (codeMirrorElt) {
        $(elt).append(codeMirrorElt);
    }, {
        parserfile: ['tokenizejavascript.js', 'parsejavascript.js'],
        path: 'lib/codemirror/js/',
        stylesheet: 'lib/codemirror/css/jscolors.css',
        content: content
    });
    this._editor = editor;
};

Remix.Editor.prototype = {
    getScript: function () {
        return this._editor.getCode();
    }
};

Remix.Instance = function (options) {
    _.bindAll(this, 'run', '_handleBrowse');
    this._editor = new Remix.Editor(options.editorElt, options.editorContent);
    this._audioContext = new AudioContext();
    this._tracks = [];
    this._nest = new Nest(options.echonestApiKey);

    if (options.runElt) {
        $(options.runElt).bind('click', this.run);
    }
    if (options.browseElt) {
        $(options.browseElt).bind('change', this._handleBrowse);
    }
};

function toSourceList(context, qqs) {
    var sources = [];
    qqs.forEach(function(qq, i) {
        if (!qq) {
            console.log('missing AudioQuantum at index ' + i);
            return;
        }
        // TODO fix in analysis
        if (!qq.duration) {
            return;
        }
        sources.push(new RangeSampleSource(qq.container.analysis._source, Math.floor(context.sampleRate * qq.start), Math.floor(context.sampleRate * qq.duration)));
    })
    return new SourceList(sources);
}

Remix.Instance.prototype = {
    addFile: function (file) {
        var track = new Remix.Track();
        track._remix = this;
        this._tracks.push(track);
        
        track.file = file;
        track.analyze();
        
        var loader = new Remix.Loader();
        track.loader = loader;
        loader.onload = _.bind(track._onFileLoad, track);
        loader.loadFromFile(file);
    },

    getScript: function () {
        return this._editor.getScript();
    },

    _userPlay: function (qqs) {
        if (this._player) {
            this._player.stop();
        }
        var player = new SampleSourcePlayer(this._audioContext, 16384);
        player.sampleSource = toSourceList(this._audioContext, qqs);
        player.start();
        this._player = player;
    },

    run: function () {
        var js = this._editor.getScript();
        var errors = Remix.validateJs(js);
        if (errors.length > 0) {
            console.log('errors', errors);
        }
        var tracks = this._tracks.map(function (track) { return track.toUser(); });
        var track = tracks[tracks.length - 1];
        var analysis = track.analysis;
        var play = _.bind(this._userPlay, this);
        try {
            eval(js);
        }
        catch (e) {
            console.log('exception', e);
        }
    },

    _handleBrowse: function (e) {
        var files = e.target.files;
        for (var i = 0; i < files.length; i++) {
            this.addFile(files[i]);
        }
        e.target.value = null;
    }
}

})();
