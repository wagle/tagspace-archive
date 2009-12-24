var Cc= Components.classes;
var Ci= Components.interfaces;

var BookmarkTags= function ()
{
    const bmServ=
        Cc["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(Ci.nsINavBookmarksService);
    const histServ=
        Cc["@mozilla.org/browser/nav-history-service;1"].
        getService(Ci.nsINavHistoryService);
    const storageServ=
        Cc["@mozilla.org/storage/service;1"].
        getService(Ci.mozIStorageService);

    var dbConn;         // one connection to profile:places.sqlite
    var dbConnIsShared; // Fx 3.1: see initDBConn

    function doDelete()
    {
        var sql;
        var placesDBFile;
        var ids;
        var dbStmt;

        sql= [
            "SELECT cf.id AS id, cf.title AS title ",
            "FROM moz_bookmarks AS cf ",
            "LEFT OUTER JOIN moz_bookmarks AS pf ON cf.parent = pf.id ",
            "WHERE pf.id ISNULL AND cf.id > 1;"
        ].join("");

        initDBConn();

        if (! dbConn) return;

        try
        {
            while (true)
            {
                ids= [];
                dbStmt= dbConn.createStatement(sql);
                while (dbStmt.executeStep())
                {
                    let id= dbStmt.getInt64(0);
                    ids.push(id);
                }
                dbStmt.reset();
                dbStmt.finalize();
                dbStmt= null;

                if (ids.length === 0) break;

                ids.forEach(function (id)
                {
                    let dsql= [
                        "DELETE FROM moz_bookmarks WHERE id = ", id
                    ].join("");
                    dbConn.executeSimpleSQL(dsql);
                });
            }
        }
        finally
        {
            if (dbStmt)
            {
                dbStmt.reset();
                dbStmt.finalize();
            }
            cleanupDBConn();
        }

        alert("Done.  TagSifter will not be updated until you restart Firefox.");
    }

    function onselect(tree, event)
    {
        var idx;
        var id;

        idx= tree.view.selection.currentIndex;
        id= tree.view.getCellText(idx, tree.columns.getColumnAt(1));

        switch (bmServ.getItemType(id))
        {
        case bmServ.TYPE_BOOKMARK:
            showBM(id);
            break;
        case bmServ.TYPE_FOLDER:
            showFolder(id);
            break;
        }
    }

    function showFolder(id)
    {
        var view;
        var ctree;
        var result;
        var qopts;
        var query;

        document.getElementById("bmbox").hidden= true;
        document.getElementById("folderbox").hidden= false;

        qopts= histServ.getNewQueryOptions();
        query= histServ.getNewQuery();
        query.setFolders([id], 1);
        result= histServ.executeQuery(query, qopts);

        ctree= document.getElementById("childtree");
        view= new PlacesTreeView(false);
        result.viewer= view;
        ctree.view= view.QueryInterface(Components.interfaces.nsITreeView);
    }

    function showBM(id)
    {
        document.getElementById("folderbox").hidden= true;
        document.getElementById("bmbox").hidden= false;
    }

    function initDBConn()
    {
        const storageServ=
            Cc["@mozilla.org/storage/service;1"].
            getService(Ci.mozIStorageService);

        try
        {
            // Fx 3.1: https://bugzilla.mozilla.org/show_bug.cgi?id=452857
            if (Ci.nsPIPlacesDatabase)
            {
                dbConnIsShared= true;
                dbConn=
                    Cc["@mozilla.org/browser/nav-history-service;1"].
                    getService(Ci.nsPIPlacesDatabase).
                    DBConnection;
            }
            else
            {
                dbConnIsShared= false;
                let placesDBFile=
                    Cc["@mozilla.org/file/directory_service;1"].
                    getService(Ci.nsIProperties).
                    get("ProfD", Ci.nsIFile);
                placesDBFile.append("places.sqlite");
                dbConn= storageServ.openDatabase(placesDBFile);
            }
        }
        catch (exc)
        {
            dbConn= null;
            BookmarkTags.Util.logErr("Could not open Places database: " + exc);
        }
    }

    function cleanupDBConn()
    {
        if (dbConn && !dbConnIsShared) dbConn.close();
        dbConn= null;
    }

    return {
        doDelete: doDelete,
        onselect: onselect
    };
}();
