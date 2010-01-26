//= require <TagSifter>

var TagSifter;
TagSifter = TagSifter || {};

TagSifter.PlacesConnection = function () {
};

(
  function () {
    var pc = TagSifter.PlacesConnection;

    pc.shared_connection = false;
    pc.connection        = null;

    TagSifter.PlacesConnection.prototype = {
      initialize:  function () {
        this.getConnection();
      }, // initialize

      getConnection: function () {
        this.connection = pc.connection;
        if (! this.connection) {
          this.establishOneTimeConnection();
        }

        return this.connection;
      }, // 

      establishOneTimeConnection:  function () {
      }, // establishOneTimeConnection

      close:  function () {
        if (pc.connection) return true;

        // TODO
        // disconnect
        // this.connection = null;
      }, // close
    };
  }
)();

