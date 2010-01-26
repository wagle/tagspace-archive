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
   }
};

/* To use: */

// TagSifter.loadLibraries(TagSifter);

/*  */
