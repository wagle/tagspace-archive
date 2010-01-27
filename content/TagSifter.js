var TagSifter = {
  // From http://forums.mozillazine.org/viewtopic.php?f=19&t=1460255
  loadLibraries:  function(context){
    if (TagSifter.jQuery) return;
    var loader = Components.classes[
      "@mozilla.org/moz/jssubscript-loader;1"
    ].getService(
      Components.interfaces.mozIJSSubScriptLoader
    );
    loader.loadSubScript(
      "chrome://bookmarktags/content/vendor/jquery-1.4.0.min.js",
      context
    );
    var jQuery = window.jQuery.noConflict(true);
    // loader.loadSubScript("chrome://bookmarktags/content/jquery.someplugin.min.js", jQuery);
    TagSifter.jQuery = jQuery;
    TagSifter.$J     = jQuery;
  },

  build$J:  function (defaultContext) {
    defaultContext = defaultContext || window._content.document;
    TagSifter.loadLibraries(TagSifter);  // If already loaded, almost a no-op.
    var jQuery = TagSifter.jQuery;
    var $J = function(selector,context) {
      return new jQuery.fn.init(selector,context||defaultContext);
    };
    $J.fn = $J.prototype = jQuery.fn;
    return $J;
  },
   
};

/* To use: */

// TagSifter.loadLibraries(TagSifter);

/*  */
