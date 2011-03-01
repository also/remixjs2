var PITCH_NAMES = ["C", "C♯", "D", "E♭", "E", "F", "F♯", "G", "A♭", "A", "B♭", "B"];

var Analysis = {
    computeKey: function (segments) {
        var s, c;
        if (segments == null) {
            return;
        }

        // Build up the chroma for this section
        var chroma = [0,0,0,0,0,0,0,0,0,0,0,0];
        for (var j = 0; j < segments.length; j++) {
            s = segments[j];
            for (c = 0; c < 12; c++) {
                chroma[c] = chroma[c] + s.pitches[c];
            }
        }

        var major, minor;

        // compute triads.
        var majTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        var minTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        for (var i = 0; i < segments.length; i++) {
            s = segments[i];
            // Total energy in this chord
            var total = s.pitches.sum();
            if (total <= 0.0001) {
                continue;
            }

            var maxVal = -1.0;
            var major_triad = true;
            // Let's estimate the chord and fill the triadMatrix
            for (j = 0; j < 12; j++) {
                minor = s.pitches[j] + s.pitches[ (j+3) % 12] + s.pitches[ (j+7) % 12]; // minor triad
                if (maxVal < minor)  {
                    maxVal = minor;
                    maxIndex = j;
                    major_triad = false;
                }

                major = s.pitches[j] + s.pitches[ (j+4) % 12 ] + s.pitches[ (j+7) % 12 ]; // major triad
                if (maxVal < major)  {
                    maxVal = major;
                    maxIndex = j;
                    major_triad = true;
                }
            }
            if (major_triad) {
                majTriads[maxIndex] += maxVal / total;
            }
            else {
                minTriads[maxIndex] += maxVal / total;
            }
        }

        // find scales
        var scale_profile = [0,0,0,0,0,0,0,0,0,0,0,0];
        // We define the major scale
        // e.g. for C major: [C, C#, D, D#, E, F, F#, G, G#, A, Bb, B]
        // C, D, E, F, G, A, B => 0, 2, 4, 5, 7, 9, 11
        // In terms of triads, the major scale embeds CM, Dm, Em, FM, GM, Am, Bm
        // We're testing every possible major scale option by summing weights in the corresponding triad bins
        // Note the major scale is equivalent to a relative minor scale
        for (i = 0; i < 12; i++) {
            scale_profile[i]    = majTriads[ (i+0) % 12]
                                + minTriads[ (i+2) % 12]
                                + minTriads[ (i+4) % 12]
                                + majTriads[ (i+5) % 12]
                                + majTriads[ (i+7) % 12]
                                + minTriads[ (i+9) % 12]
                                + minTriads[(i+11) % 12];
        }

        majorKey = 0;
        for (c = 0; c < scale_profile.length; c++) {
            if (scale_profile[majorKey] < scale_profile[c]) {
                majorKey = c;
            }
        }
        // Ok, we've got the right scale, but are we major or minor?
        major = majTriads[majorKey] * chroma[majorKey];

        // The minor third scale below is equivalent to the major scale
        var minorKey = (majorKey + 9) % 12;
        minor = minTriads[minorKey] * chroma[minorKey];

        return {
            key: (minorKey <= majorKey) ? majorKey : minorKey,
            mode: (minorKey <= majorKey)
        };
    }
};

function loudness_factor(db) {
    // db is in dBFS, which has a max of 0, and a min (assuming 16-bit) of -96.
    // get a number between 0 and 1 that corresponds to how loud the sound is.
    // these seeems to hover around .8-.9; need more discrimination.
    var unit = (db + 96.0) / 96.0;

    // exaggerate differences at higher end of loudness.
    return Math.pow(10, unit) / 10;
}

function Event(e) {
    this.start = e.start;
    this.duration = e.duration;
    this.key = 0;
    this.loudness = 0;
    this.mode = "fake"; // defaults
    this.alpha = 255; // yikes.
    if (e.confidence) {
        this.confidence = e.confidence;
    }
    else {
        this.confidence = 0; // got no confidence
    }
}

Event.prototype = {
    end: function(){
        return this.start + this.duration;
    },
    
    contains: function (s) {
        return (this.start <= s.start && s.end() <= this.end());
    },

    overlaps: function (s) {
        return (this.start <= s.start && s.start < this.end()) ||
               (this.start < s.end() && s.end() <= this.end());
    },

    computeOverallLoudness: function(segments) {
        var dbSum = 0.0;
        var segment_count = 0;
        for (var j = 0; j < segments.length; j++) {
            var s = segments[j];
            if (this.contains(s)) {
                dbSum += s.dbMax;
                segment_count += 1;
            }
        }
        if (segment_count == 0) {
            this.loudness = 0;
        }
        else {
            this.loudness = dbSum / segment_count;
        }
    },

    computeKey: function (segments) {
        var s, c;
        if (segments == null) {
            return;
        }

        // Build up the chroma for this section
        var chroma = [0,0,0,0,0,0,0,0,0,0,0,0];
        var seg_start = -1;
        var seg_end = 0;
        for (var j = 0; j < segments.length; j++) {
            s = segments[j];
            if (this.contains(s)) {
                seg_end = j;
                if (seg_start == -1) {
                    seg_start = j;
                }

                for (c = 0; c < 12; c++) {
                    chroma[c] = chroma[c] + s.pitches[c];
                }
            }
        }
        if (seg_start == -1) {
            seg_start = 0;
        }

        var major, minor;

        // compute triads.
        var majTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        var minTriads = [0,0,0,0,0,0,0,0,0,0,0,0];
        for (var i = seg_start; i < seg_end; i++) {
            s = segments[i];
            // Total energy in this chord
            var total = s.pitches.sum();
            if (total <= 0.0001) {
                continue;
            }

            var maxVal = -1.0;
            var major_triad = true;
            // Let's estimate the chord and fill the triadMatrix
            for (j = 0; j < 12; j++) {
                minor = s.pitches[j] + s.pitches[ (j+3) % 12] + s.pitches[ (j+7) % 12]; // minor triad
                if (maxVal < minor)  {
                    maxVal = minor;
                    maxIndex = j;
                    major_triad = false;
                }

                major = s.pitches[j] + s.pitches[ (j+4) % 12 ] + s.pitches[ (j+7) % 12 ]; // major triad
                if (maxVal < major)  {
                    maxVal = major;
                    maxIndex = j;
                    major_triad = true;
                }
            }
            if (major_triad) {
                majTriads[maxIndex] += maxVal / total;
            }
            else {
                minTriads[maxIndex] += maxVal / total;
            }
        }

        // find scales
        var scale_profile = [0,0,0,0,0,0,0,0,0,0,0,0];
        // We define the major scale
        // e.g. for C major: [C, C#, D, D#, E, F, F#, G, G#, A, Bb, B]
        // C, D, E, F, G, A, B => 0, 2, 4, 5, 7, 9, 11
        // In terms of triads, the major scale embeds CM, Dm, Em, FM, GM, Am, Bm
        // We're testing every possible major scale option by summing weights in the corresponding triad bins
        // Note the major scale is equivalent to a relative minor scale
        for (i = 0; i < 12; i++) {
            scale_profile[i]    = majTriads[ (i+0) % 12]
                                + minTriads[ (i+2) % 12]
                                + minTriads[ (i+4) % 12]
                                + majTriads[ (i+5) % 12]
                                + majTriads[ (i+7) % 12]
                                + minTriads[ (i+9) % 12]
                                + minTriads[(i+11) % 12];
        }

        majorKey = 0;
        for (c = 0; c < scale_profile.length; c++) {
            if (scale_profile[majorKey] < scale_profile[c]) {
                majorKey = c;
            }
        }
        // Ok, we've got the right scale, but are we major or minor?
        major = majTriads[majorKey] * chroma[majorKey];

        // The minor third scale below is equivalent to the major scale
        var minorKey = (majorKey + 9) % 12;
        minor = minTriads[minorKey] * chroma[minorKey];

        this.key = (minorKey <= majorKey) ? majorKey : minorKey;
        this.mode = (minorKey <= majorKey) ? "major" : "minor";
    }
};

function TrackInfo(t) {
    this.bpm = t.track.tempo;
    this.key = t.track.key;
    this.mode = t.track.mode ? "major" : "minor";
    this.mode_confidence = t.track.mode_confidence;
    this.duration = t.track.duration;
    this.meter = t.track.time_signature;
    this.end_of_fade_in = t.track.end_of_fade_in;
    this.start_of_fade_out = t.track.start_of_fade_out;
    // Overall loudness is a function of the local maximum loudness, the dynamic range, and the overall top loudness.
    // The greater the dynamic range, the more influential it is on turning down the overall loudness.
    // As a result, highly compressed music sounds louder than non compressed music, even if their maximum loudnesses are similar.
    // Ratios are currently empirical and would require a user study.
    this.overall_loudness = t.track.loudness;
    

    this.segments = [];
    for (var i = 0; i < t.segments.length; i++) {
        this.segments[i] = new Segment(t.segments[i], this);
    }

    this.max_loudness = 0;
    this.min_loudness = -96; // min 16-bit dbFS
    if (0 < this.segments.length) {
        this.max_loudness = this.segments[0].dbMax;
        this.min_loudness = this.segments[0].dbMax;
        for (i = 0; i < this.segments.length; i++) 
        {
            if (this.max_loudness < this.segments[i].dbMax)
                this.max_loudness = this.segments[i].dbMax;
                
            if (this.min_loudness > this.segments[i].dbMax)
                this.min_loudness = this.segments[i].dbMax;
        }
    }

    this.sections = this.parseEventList(t.sections, null);
    this.fixSections(); // Sections need some lovin' before we assign keys.
    for (i = 0; i < this.sections.length; i++) {
        this.sections[i].computeKey(this.segments);
        this.sections[i].computeOverallLoudness(this.segments);
    }

    this.bars = this.parseEventList(t.bars, this.segments);
    this.beats = this.parseEventList(t.beats, this.segments);
    this.tatums = this.parseEventList(t.tatums, null);
    
    var curr = 0;
    var max_count = 0;
    var x_per_y = 0;
    var x = this.tatums;
    var y = this.bars;
    for (i = 0; i < x.length; i++)
    {
        if (curr < y.length && y[curr].contains(x[i]))
            x_per_y += 1;
        else
        {
            if (max_count < x_per_y)
                max_count = x_per_y;
            x_per_y = 1;
            curr += 1;
        }
    }
    this.max_tatums_per_bar = max_count;
    console.log('max tatums per bar', max_count);
    
    // Compute timbre range to provide better colors.
    this.timbreMin = [500,500,500,500,500,500,500,500,500,500,500,500];
    this.timbreMax = [0,0,0,0,0,0,0,0,0,0,0,0];
    for (i = 0; i < this.segments.length; i++) {
        s = this.segments[i];
        for (var j = 0; j < 12; j++) {
            var tim = s.timbre[j];
            if (tim < this.timbreMin[j]) {
                this.timbreMin[j] = tim;
            }
            if (this.timbreMax[j] < tim) {
                this.timbreMax[j] = tim;
            }
        }
    }
}

TrackInfo.prototype = {
    parseEventList: function (event_list, segment_list) {
        var data = [];

        for (var i = 0; i < event_list.length; i++) {
            data[i] = new Event(event_list[i]);
            // TODO: This is grossly inefficient. Fix by only giving relevant segments.
            if (segment_list) {
                data[i].computeKey(segment_list);
                data[i].computeOverallLoudness(segment_list);
            }
        }
        return data;
    },

    fixSections: function () {
        // Fix a bug in an3 where the last section doesn't extend to the end of the track.
        var last = this.sections.length -1;
        if (0 <= last) {
            this.sections[last].duration = this.duration - this.sections[last].start;
        }

        // Split the first section into a fadein and the rest.
        if (0.2 < this.end_of_fade_in && 0 < this.sections.length) {
            if (this.end_of_fade_in < this.sections[0].duration) {
                var s = new Event(this.sections[0]);
                s.duration = this.end_of_fade_in;
                s.fadein = true;
                this.sections[0].start = this.end_of_fade_in;
                this.sections[0].duration -= this.end_of_fade_in;
                this.sections.unshift(s);
            }
            else {
                this.sections[0].fade = true;
            }
        }

        // split the lst section into 2; a fadeout and the other part.
        last = this.sections.length - 1;
        if (this.start_of_fade_out < this.duration && 0 <= last) {
            if (this.sections[last].start < this.start_of_fade_out) {
                var s = new Event(this.sections[last]);
                this.sections[last].duration = this.start_of_fade_out - this.sections[last].start;
                s.start = this.start_of_fade_out;
                s.duration = this.duration - this.start_of_fade_out;
                s.fadeout = true;
                this.sections.push(s);
            }
            else {
                this.sections[last].fade = true; // good enough.
            }
        }
    }
}

function Segment(s, t) {
    this._track = t;
    this.timbre = s.timbre;
    this.pitches = s.pitches;

    this.start = s.start;
    this.duration = s.duration;
    this.loudness = s.loudness_max; // for consistency of interface with Event.

    this.dbStart = s.loudness_start;
    this.dbMax = s.loudness_max;
    this.dbsf = loudness_factor(this.dbStart);
    this.dbmf = loudness_factor(this.dbMax);
}

Segment.prototype = {
    end: function() 
    {
        return this.start + this.duration;
    }
}
function AudioAnalysis(analysis) {
    extend(this, analysis);

    var duration = this.duration;

    this.sections = AudioQuantumList.fromSections(this.sections);
    this.sections.analysis = this;

    this.bars = AudioQuantumList.fromEvents('bar', this.bars, duration);
    this.bars.analysis = this;

    this.beats = AudioQuantumList.fromEvents('beat', this.beats, duration);
    this.beats.analysis = this;

    this.tatums = AudioQuantumList.fromEvents('tatum', this.tatums, duration);
    this.tatums.analysis = this;

    this.segments = AudioQuantumList.fromSegments(this.segments);
    this.segments.analysis = this;
}

function AudioQuantum() {
    this.start = 0;
    this.end = 0;
    this.duration = 0;
}

extend(AudioQuantum.prototype, {
    clone: function () {
        var that = new AudioQuantum();
        that.start = this.start;
        that.end = this.end;
        that.duration = this.duration;
        that.container = this.container;
        return that;
    },

    setDuration: function(duration) {
        this.duration = duration;
        this.end = this.start + duration;
    },

    setEnd: function(end) {
        this.end = end;
        this.duration = this.end - this.start;
    },

    parent: function() {
        // TODO handle error
        var uppers = this.container.analysis[AudioQuantum.parentAttributes[this.container.kind]];
        return uppers.that(selection.overlap(this))[0];
    },

    children: function() {
        // TODO handle error
        var downers = this.container.analysis[AudioQuantum.childrenAttributes[this.container.kind]];
        return downers.that(selection.areContainedBy(this));
    },

    group: function() {
        var parent = this.parent();
        if (parent) {
            return parent.children();
        }
        else {
            return this.container;
        }
    },

    localContext: function() {
        var group = this.group();
        return [group.indexOf(this), group.length];
    }
});

extend(AudioQuantum, {
    parentAttributes: {
        bar: 'sections',
        beat: 'bars',
        tatum: 'beats'
    },

    childrenAttributes: {
        section: 'bars',
        bar: 'beats',
        beat: 'tatums'
    }
});

function AudioQuantumList(kind) {
    var array = extend([], AudioQuantumList.Methods);
    array.kind = kind;
    return array;
}

AudioQuantumList.Methods = {
    that: function(filter) {
        var result = new AudioQuantumList(this.kind);

        for (var i = 0; i < this.length; i++) {
            var aq = this[i];
            if (filter(aq)) {
                result.push(aq);
            }
        }
        return result;
    },

    orderedBy: function(fn, descending) {
        var result = new AudioQuantumList(this.kind);
        result.push.apply(result, this);
        result.sort(function(a, b) {
            var aa = fn(a);
            var bb = fn(b);
            if (aa > bb) {
                return 1;
            }
            if (aa < bb) {
                return -1;
            }
            return 0;
        });
        // TODO
        if (descending) {
            result.reverse();
        }
        return result;
    }
};

extend(AudioQuantumList, {
    fromEvents: function(kind, events, duration) {
        var aqs = new AudioQuantumList(kind);

        var previousAq = new AudioQuantum();
        previousAq.start = 0;
        for (var i = 0; i < events.length; i++) {
            var event = events[i];
            var aq = new AudioQuantum();

            aq.start = aq.value = event.start;
            aq.confidence = event.confidence;
            aq.container = aqs;
            aqs.push(aq);

            previousAq.setEnd(aq.start);
            previousAq = aq;
        }
        // TODO audio.py duplicates the duration of the second-to-last event
        previousAq.setEnd(duration);
        return aqs;
    },

    fromSections: function(sections) {
        var aqs = new AudioQuantumList('section');
        for (var i = 0; i < sections.length; i++) {
            var section = sections[i];
            var aq = new AudioQuantum();

            aq.start = section.start;
            aq.setDuration(section.duration);
            aq.container = aqs;
            aqs.push(aq);
        }
        return aqs;
    },

    fromSegments: function(segments) {
        var aqs = new AudioQuantumList('segment');
        for (var i = 0; i < segments.length; i++) {
            var segment = segments[i];
            var aq = new AudioQuantum();

            aq.start = aq.value = segment.start;
            aq.setDuration(segment.duration);
            aq.pitches = segment.pitches;
            aq.timbre = segment.timbre;
            aq.loudnessBegin = segment.startLoudness;
            aq.loudnessMax = segment.maxLoudness;
            aq.timeLoudnessMax = segment.maxLoudnessTimeOffset;
            aq.loudnessEnd = segment.endLoudness;
            aq.container = aqs;
            aqs.push(aq);
        }
        return aqs;
    }
});
function FilteredAudioQuantum(audioQuantum, name, options) {
    var that = audioQuantum.clone();
    extend(that, FilteredAudioQuantum.Methods);
    that.filters = that.filters || [];
    that.filter(name, options);
    return that;
}

FilteredAudioQuantum.Methods = {
    filter: function (name, options) {
        this.filters.push({name: name, options: options});
    },

    clone: function () {
        var that = AudioQuantum.prototype.clone.apply(this);
        that.filters = this.filters.slice(0);
        return that;
    }
};

extend(FilteredAudioQuantum, {
    addFilter: function (name) {
        AudioQuantum.prototype[name] = function (options) {
            return this.filtered('touch', options);
        };
    }
});

extend(AudioQuantum.prototype, {
    filtered: function (name, options) {
        return new FilteredAudioQuantum(this, name, options);
    }
});
var Remix = {
    init: function(apiKey) {
        if (apiKey) {
            // TODO handle quota exception
            localStorage.echoNestApiKey = apiKey;
        }
        swfobject.embedSWF('remix.swf', 'swf', '0', '0', '9.0.0', null, {apiKey: localStorage.echoNestApiKey}, {wmode: 'transparent'});

        this._tracks = [];
        this._trackMap = {};

        this._searchMap = {};

        // add selection and sorting functions to global scope
        extend(window, selection);
        extend(window, sorting);
    },

    apiKeyRequired: function () {
        return !localStorage.echoNestApiKey;
    },

    onError: function(message) {},

    log: function () {},

    __init: function() {
        this._swf = document.getElementById('swf');
    },

    getTrack: function(trackId) {
        var track = this._trackMap[trackId];
        if (!track) {
            track = {id: trackId};
            this._trackMap[trackId] = track;
            this._tracks.push(track);
            this.onTrackAdded(track);
        }
        return track;
    },

    removeTrack: function (track) {
        var i = this._tracks.indexOf(track);
        this._tracks.splice(i, 1);
        delete this._trackMap[track.id];
        this._swf.unloadTrack(track.id);
    },

    __setTrackState: function (trackId, state, arg) {
        Remix.log('track state: ', trackId, state, arg);
        var track = this.getTrack(trackId);
        track.state = state;
        if (state == 'sound_loading') {
            track.file = arg;
            this.onTrackSoundLoading(track);
        }
        else if (state == 'sound_loaded') {
            track.sound = arg;
            track.soundLoaded = true;
            this.onTrackSoundLoaded(track);
        }
        else if (state == 'md5_calculated') {
            track.md5 = arg;
            track.key = arg;
            this._loadAnalysis(track);
        }
        else if (state == 'analysis_loading') {
            this.onTrackAnalysisLoading(track);
        }
        else if (state == 'analysis_loaded') {
            track.rawAnalysis = arg;
            track.analysis = new AudioAnalysis(track.rawAnalysis);
            track.analysis.track = track;
            localStorage['analysis_' + track.key] = JSON.stringify(track.rawAnalysis);
            track.analysisLoaded = true;
            this.onTrackAnalysisLoaded(track);
        }
    },

    _loadAnalysis: function (track) {
        var analysisString = localStorage['analysis_' + track.key];
        if (analysisString) {
            track.rawAnalysis = JSON.parse(analysisString);
            track.analysis = new AudioAnalysis(track.rawAnalysis);
            track.analysis.track = track;
            track.analysisLoaded = true;
            this.onTrackAnalysisLoaded(track);
        }
        else {
            this._swf.loadAnalysis(track.id);
        }
    },

    onTrackAdded: function (track) {},

    onTrackSoundLoading: function (track) {},

    onTrackSoundLoaded: function (track) {},

    onTrackAnalysisLoading: function (track) {},

    onTrackAnalysisLoaded: function (track) {},

    togglePlayPause: function () {
        this._swf.togglePlayPause();
    },

    resetPlayer: function () {
        this._swf.resetPlayer();
    },

    __setProgress: function (progress, sourceIndex, sourcePosition) {
        this.onPlayerProgress(progress, sourceIndex, sourcePosition);
    },

    onPlayerProgress: function (progress, sourceIndex, sourcePosition) {},

    __setPlayerState: function (state) {
        this['onPlayer' + state[0].toUpperCase() + state.substring(1)]();
    },

    onPlayerReady: function () {},

    onPlayerEmpty: function () {},

    onPlayerPlaying: function () {},

    onPlayerPaused: function () {},

    onPlayerComplete: function () {},

    search: function (params) {
        var search = {params: params};
        var searchId = this._swf.search(params);
        search.id = searchId;
        this._searchMap[searchId] = search;
        return search;
    },

    __setSearchState: function (searchId, state, arg) {
        Remix.log('search state: ', searchId, state, arg);
        var search = this._searchMap[searchId];
        if (state == 'echo_nest_error') {
            if (arg.description == 'no results') {
                this.onSearchNoResults(search);
            }
            else {
                search.error = arg;
                this.onSearchError(search);
            }
        }
        else if (state == 'error') {
            search.error = arg;
            this.onSearchError(search);
        }
        else if (state == 'complete') {
            search.results = arg;
            this.onSearchResults(search);
        }
    },

    onSearchResults: function (search) {},

    onSearchNoResults: function (search) {},

    remix: function(aqs) {
        try {
            if (!aqs) {
                Remix.onError('remix must return an array of audio quanta');
                return;
            }
            if (!aqs.processed) {
                aqs = Remix.processAqs(aqs);
            }
            this.playingAqs = aqs;
            this.mixSpec = [];
            for (var i = 0; i < aqs.length; i++) {
                var aq = aqs[i];
                if (aq.end < aq.start) {
                    Remix.onError('end position ' + i + ' is before start position');
                    return;
                }
                var track = aq.track || aq.container.analysis.track;
                var spec = [track.id, aq.start, aq.end];

                if (aq.filters) {
                    spec.push({filters: aq.filters});
                }
                this.mixSpec.push(spec);
            }
            this.playingSingleRange = false;
            this.remixString(JSON.stringify(this.mixSpec));
        }
        catch (e) {
            Remix.onError(e);
        }
    },

    processAqs: function(aqs) {
        if (aqs.flatten) {
            aqs = aqs.flatten();
        }
        else {
            aqs = [aqs];
        }
        var result = [];
        result.processed = true;
        var offset = 0;
        for (var i = 0; i < aqs.length; i++) {
            var aq = aqs[i];
            var track = aq.track || aq.container.analysis.track;
            var duration = aq.end - aq.start;
            result.push({
                track: track,
                source: aq,
                start: aq.start,
                end: aq.end,
                index: i,
                duration: duration,
                offset: offset,
                filters: aq.filters});

            offset += duration;
        }
        return result;
    },

    play: function (aq) {
        var track = aq.track || aq.container.analysis.track;
        var spec = [track.id, aq.start, aq.end];
        this.playingSingleRange = true;
        this.remixString(JSON.stringify([spec]));
    },

    remixString: function (string) {
        this._swf.setRemixString(string);
    },

    load: function (url, enTrackId) {
        var trackId = this._swf.load(url, enTrackId);
        var track = this.getTrack(trackId);
        track.key = enTrackId;
        this._loadAnalysis(track);
        return track;
    }
};

Remix.__log = Remix.log;

if (!window.localStorage) {
    window.localStorage = {};
}

if (''.toJSON) {
    JSON.stringify = Object.toJSON;
    JSON.parse = JSON.parse || function(s) { return s.evalJSON(true); };
}

FilteredAudioQuantum.addFilter('touch');
/**
* Selection filters.
*
* The functions in this module each return *another* function that takes
* one argument, an `AudioQuantum`, and returns an `AudioQuantum` or `false`.
*
* By convention, all of these functions are named to be verb phrases that
* agree with a plural noun in a restrictive clause introduced by `that`,
* as in::
*
*     analysis.segments.that(fallOnThe(1))
*/
var selection = {
    /**
    * Returns a function that tests if its input `AudioQuantum` lies
    * between the *start* and *end* parameters.
    */
    areContainedByRange: function(start, end) {
        return function(x) {
            return x.start >= start && x.end <= end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` lies
    * within the interval of the parameter *aq* `AudioQuantum`,
    */
    areContainedBy: function(aq) {
        return function(x) {
            return x.start >= aq.start && x.end <= aq.end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` overlaps
    * in any way the interval between the parameters *start* and *end*.
    */
    overlapRange: function(start, end) {
        return function(x) {
            return x.end > start && x.start < end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` overlaps
    * in any way the parameter *aq* `AudioQuantum`.
    */
    overlap: function(aq) {
        return function(x) {
            return x.end > aq.start && x.start < aq.end;
        };
    },


    /**
    * Returns a function that tests if its input `AudioQuantum`\'s `end`
    * lies in the interval between the parameters *start* and *end*.
    */
    endDuringRange: function(start, end) {
        return function(x) {
            return x.end > start && x.end <= end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum`\'s `end`
    * lies anywhere during the parameter *aq* `AudioQuantum`.
    */
    endDuring: function(aq) {
        return function(x) {
            return x.end > aq.start && x.end <= aq.end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum`\'s `start`
    * lies in the interval between the parameters *start* and *end*.
    */
    startDuringRange: function(start, end) {
        return function(x) {
            return x.start >= start && x.start < end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum`\'s `start`
    * lies anywhere during the parameter *aq* `AudioQuantum`.
    */
    startDuring: function(aq) {
        return function(x) {
            return x.start >= aq.start && x.start < aq.end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` contains
    * the input parameter *point*, a time offset, in seconds.
    */
    containPoint: function(point) {
        return function(x) {
            return point > x.start && point < x.end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` has
    * a `pitch`\[*pitchmax*] such that it is greater or equal to all
    * other values in its `pitch` vector.
    */
    havePitchMax: function(pitchmax) {
        return function(x) {
            return selection._isMaxPitch(pitchmax, x.pitches);
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` has
    * a maximum `pitch`\[*p*] such that it is greater or equal to all
    * other values in its `pitch` vector, and *p* is in `List` parameter
    * *pitchesmax*.
    */
    havePitchesMax: function(pitchesmax) {
        return function(x) {
            var pitches = x.pitches;
            for (var i = 0; i < pitchesmax.length; i++) {
                if (selection._isMaxPitch(pitchesmax[i], x.pitches)) {
                    return true;
                }
            }
            return false;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` lies
    * immediately before the parameter *aq* `AudioQuantum`. That is,
    * if the tested `AudioQuantum`\'s `end` == *aq*.start .
    */
    lieImmediatelyBefore: function(aq) {
        return function(x) {
            return x.end == aq.start;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` lies
    * immediately after the parameter *aq* `AudioQuantum`. That is,
    * if the tested `AudioQuantum`\'s `start` == *aq*.end .
    */
    lieImmediatelyAfter: function(aq) {
        return function(x) {
            return x.start == aq.end;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` has
    * a (one-indexed) ordinality within its `group`\() that is equal
    * to parameter *beatNumber*.
    */
    fallOnThe: function(beatNumber) {
        return function(x) {
            return x.localContext()[0] == (beatNumber - 1);
        };
    },

/* The following take AudioQuantumLists as input arguments: */

    /**
    * Returns a function that tests if its input `AudioQuantum` contains
    * the `end` of any of the parameter *aqs*, a `List` of
    * `AudioQuantum`\s.
    */
    overlapEndsOf: function(aqs) {
        return function(x) {
            for (var i = 0; i < aqs.length; i++) {
                var aq = aqs[i];
                if (x.start <= aq.end && x.end >= aq.end) {
                    return true;
                }
            }
            return false;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` contains
    * the `start` of any of the parameter *aqs*, a `List` of
    * `AudioQuantum`\s.
    */
    overlapStartsOf: function(aqs) {
        return function(x) {
            for (var i = 0; i < aqs.length; i++) {
                var aq = aqs[i];
                if (x.start <= aq.start && x.end >= aq.start) {
                    return true;
                }
            }
            return false;
        };
    },

    /**
    * Returns a function that tests if its input `AudioQuantum` has
    * its `start` lie in any of the parameter *aqs*, a `List` of
    * `AudioQuantum`\s.
    */
    startDuringAny: function(aqs) {
        return function(x) {
            for (var i = 0; i < aqs.length; i++) {
                var aq = aqs[i];
                if (aq.start <= x.start && aq.end >= aq.start) {
                    return true;
                }
            }
            return false;
        };
    },

    _isMaxPitch: function(pitchmax, pitches) {
        var max = pitches[pitchmax];
        for (var i = 0; i < pitches.length; i++) {
            if (pitches[i] > max) {
                return false;
            }
        }
        return true;
    }
};
/**
* Sorting key functions.
*
* All of the functions in this module can be used as a sorting key for
* `AudioQuantumList.orderedBy`, as in::
*
*     analysis.segments.orderedBy(duration)
*
* Some of the functions in this module return *another* function that takes
* one argument, an `AudioQuantum`, and returns a value (typically a `float`)
* that can then be used as a sorting value.
*
* By convention, all of these functions are named to be noun phrases that
* follow `sortedBy`, as seen above.
*/

var sorting = {
    /**
    * Returns the `AudioQuantum`\'s `confidence` as a sorting value.
    */
    confidence: function(x) {
        return x.confidence;
    },

    /**
    * Returns the `AudioQuantum`\'s `duration` as a sorting value.
    */
    duration: function(x) {
        return x.duration;
    },

    /**
    * Returns a function that returns the value of `timbre`\[*index*]
    * of its input `AudioQuantum`. Sorts by the values of the *index*-th
    * value in the timbre vector.
    */
    timbreValue: function(index) {
        return function(x) {return x.timbre[index];};
    },

    /**
    * Returns a function that returns the value of `pitch`\[*index*]
    * of its input `AudioQuantum`. Sorts by the values of the *index*-th
    * value in the pitch vector.
    */
    pitchValue: function(index) {
        return function(x) {return x.pitches[index];};
    },

    /**
    * Returns a function that returns the sum of the squared differences
    * between the `pitch` vector of its input `AudioQuantum` and the `pitch`
    * vector of the reference parameter *seg*. Sorts by the pitch distance
    * from the reference `AudioSegment`.
    */
    pitchDistanceFrom: function(seg) {
        return function(x) {return sorting._sumDiffSquared(seg.pitches, x.pitches);};
    },

    /**
    * Returns a function that returns the sum of the squared differences
    * between the `pitch` vector of its input `AudioQuantum` and the `pitch`
    * vector of the reference parameter *seg*. Sorts by the pitch distance
    * from the reference `AudioSegment`.
    */
    timbreDistanceFrom: function(seg) {
        return function(x) {return sorting._sumDiffSquared(seg.timbre, x.timbre);};
    },

    /**
    * Returns the sum of the twelve pitch vectors' elements. This is a very
    * fast way of judging the relative noisiness of a segment.
    */
    noisiness: function(x) {
        return x.pitches.sum();
    },

    /* local helper functions: */

    /**
    * Local helper function. The square of the difference between a and b.
    */
    _sumDiffSquared: function(a, b) {
        var result = 0;
        for (var i = 0; i < a.length; i++) {
            result += Math.pow(a[i] - b[i], 2);
        }
        return result;
    }
};
function extend(destination, source) {
    for (var property in source) {
        destination[property] = source[property];
    }
    return destination;
}

Array.prototype.sum = function() {
    var result = 0;
    for (var i = 0; i < this.length; i++) {
        result += this[i];
    }
    return result;
};

if (!Array.prototype.indexOf) {
    Array.prototype.indexOf = function(elt /*, from*/) {
        var len = this.length >>> 0;

        var from = Number(arguments[1]) || 0;
        from = (from < 0) ? Math.ceil(from) : Math.floor(from);
        if (from < 0) {
            from += len;
        }
        for (; from < len; from++) {
            if (from in this && this[from] === elt) {
                return from;
            }
        }
        return -1;
    };
};
