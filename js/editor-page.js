Remix.path = '../js';

var remix;

$(function () {
    remix = new Remix.Instance({
        editorElt: $('#editor'),
        runElt: $('#run'),
        browseElt: $('#browse'),
        editorContent: localStorage.editorContent,
        echonestApiKey: localStorage.echonestApiKey
    });
    window.onunload = function () {
        localStorage.editorContent = remix.getScript();
    }
});
