/* ***** BEGIN LICENSE BLOCK *****
 * Version: MPL 1.1
 *
 * The contents of this file are subject to the Mozilla Public License Version
 * 1.1 (the "License"); you may not use this file except in compliance with
 * the License. You may obtain a copy of the License at
 * http://www.mozilla.org/MPL/
 *
 * Software distributed under the License is distributed on an "AS IS" basis,
 * WITHOUT WARRANTY OF ANY KIND, either express or implied. See the License
 * for the specific language governing rights and limitations under the
 * License.
 *
 * The Original Code is the Bookmark Tags Firefox Extension.
 *
 * The Initial Developer of the Original Code is
 * Drew Willcoxon <drew.willcoxon@gmail.com>.
 * Portions created by the Initial Developer are Copyright (C) 2005, 2006,
 * 2007, 2008 the Initial Developer. All Rights Reserved.
 *
 * Contributor(s): hark <hark@grue.in>
 *
 * ***** END LICENSE BLOCK ***** */

// This nastiness is needed so our XPCOM component can access the objects here.
var EXPORTED_SYMBOLS= ["BookmarkTagsUtil"];


var BookmarkTagsUtil= function()
{
    const HELP_URL= "chrome://bookmarktags/locale/help.html";
    const HOME_URL= "http://www.grue.in/tagsieve/";

    const CC= Components.classes;
    const CI= Components.interfaces;

    const bmServ=
        CC["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(CI.nsINavBookmarksService);
    const favIconServ=
        CC["@mozilla.org/browser/favicon-service;1"].
        getService(CI.nsIFaviconService);
    const histServ=
        CC["@mozilla.org/browser/nav-history-service;1"].
        getService(CI.nsINavHistoryService);
    const prefs=
        CC["@mozilla.org/preferences-service;1"].
        getService(CI.nsIPrefService).
        getBranch("bookmarktags.");
    const stringServ=
        CC["@mozilla.org/intl/stringbundle;1"].
        getService(CI.nsIStringBundleService);
    const tagServ=
        CC["@mozilla.org/browser/tagging-service;1"].
        getService(CI.nsITaggingService);

    // Basis for tag observers and bookmark observers.  Although both observe
    // the boomarks datasource, tag observers are notified of tags added to,
    // removed from, and moved within the top tags folder and changes in tag
    // names.  Bookmark observers are notified of bookmarks added to, removed
    // from, and moved within tag folders and changes in tagged bookmark
    // properties such as names, favicons, and URIs.
    function BookmarkObserver(callback)
    {
        this.callback= callback;
        this.reset();
    }

    BookmarkObserver.prototype=
    {
        check: function (parentIds, childId, properties, observedProp, data)
        {
            const that= this;

            function addChange(parentId)
            {
                var obj;

                that.rebuildNeeded= true;
                obj=
                {
                    parentId:     parentId,
                    childId:      childId,
                    properties:   properties,
                    observedProp: observedProp,
                    data:         data
                };

                if (parentId !== null)
                {
                    if (!that.changes.parentHash.hasOwnProperty(parentId))
                    {
                        that.changes.parentHash[parentId]= obj;
                        that.changes.parentArr.push(parentId);
                    }
                }
                if (!that.changes.childHash.hasOwnProperty(childId))
                {
                    that.changes.childHash[childId]= obj;
                    that.changes.childArr.push(childId);
                }
                for (let p= 0; p < properties.length; p++)
                {
                    let prop= properties[p];
                    let propHash= that.changes.propHash;
                    propHash[prop]= propHash[prop] || {};
                    propHash[prop].childHash= propHash[prop].childHash || {};
                    propHash[prop].childHash[childId]=
                        propHash[prop].childHash[childId] || obj;
                }
            }

            for (let i= 0; parentIds && i < parentIds.length; i++)
            {
                if (this.parentCheck(parentIds[i], childId))
                {
                    addChange(parentIds[i]);
                }
            }
            if (this.childCheck(parentIds, childId)) addChange(null);

            if (this.rebuildNeeded && this.batchDepth <= 0) this.doCallback();
        },
        cleanup: function ()
        {
            this.callback= null;
        },
        doCallback: function ()
        {
            this.callback(this.changes);
            this.reset();
        },
        reset: function ()
        {
            this.batchDepth= 0;
            this.rebuildNeeded= false;
            this.changes=
            {
                childArr:   [], // child IDs
                childHash:  {}, // child ID => obj
                parentArr:  [], // parent IDs
                parentHash: {}, // parent ID => obj
                propHash:   {}  // prop name => { childHash: { child ID => obj }
            };
        },
        onBeforeItemRemoved: function (itemId, itemType) {},
        onItemAdded: function (itemId, folderId, index, itemType)
        {
            this.check([folderId], itemId, ["added"]);
        },
        onItemRemoved: function (itemId, folderId, index, itemType)
        {
            this.check([folderId], itemId, ["removed"]);
        },
        onItemMoved: function (itemId, oldParentId, oldIndex, newParentId,
                               newIndex, itemType)
        {
            this.check([oldParentId, newParentId], itemId, ["moved"]);
        },
        onBeginUpdateBatch: function ()
        {
            this.batchDepth++;
        },
        onEndUpdateBatch: function ()
        {
            this.batchDepth--;
            if (this.batchDepth <= 0 && this.rebuildNeeded) this.doCallback();
        },
        onItemVisited: function (bookmarkId, visitID, time) {}
    };

    // Attached to bookmark observers.  See makeBMObserver.
    function bmObserverChildCheck(parentIds, childId)
    {
        if (parentIds) return parentIds.some(function (id) isTag(id));
        return isTaggedItem(childId);
    }

    // Attached to bookmark observers.  See makeBMObserver.
    function bmObserverOnItemChanged(itemId, property, isAnnoProperty, value)
    {
        var props; // This must contain column names in the bookmark SQL!

        props= ["lastModified"];

        switch (property)
        {
        case "favicon":
        case "title":
            props.push(property);
            break;
        case "uri":
            props.push("url");
            break;
        case "cleartime":
            props.push("frecency");
            props.push("visit_count");
            props.push("visit_date");
            break;
        }
        this.check(null, itemId, props, property, value);
    }

    // Attached to bookmark observers.  See makeBMObserver.
    function bmObserverOnItemVisited(itemId, visitId, time)
    {
        this.check(null, itemId, ["frecency", "visit_count", "visit_date"]);
    }

    // Attached to bookmark observers.  See makeBMObserver.
    function bmObserverParentCheck(parentId, childId)
    {
        // Determine whether childId is tagged.  First try to use tagServ.  We
        // can't just rely on the isTag check below, because a tagged bookmark
        // can be copied to any regular folder, and a copy of a tagged bookmark
        // can be removed from any regular folder.  In those two cases no tag
        // folders are touched.
        try
        {
            let uri= bmServ.getBookmarkURI(childId);
            let tags= tagServ.getTagsForURI(uri, {}, {});
            if (tags && tags.length > 0) return true;
        }
        // bmServ.getBookmarkURI throws if childId has been removed.  In that
        // case we have no way of knowing whether childId was tagged, so we're
        // forced to be conservative and assume it was.
        catch (exc)
        {
            return true;
        }

        // childId is tagged if parentId is a tag folder.
        return isTag(parentId);
    }

    function chromeURI(uriStr)
    {
        const ioServ=
            Components.classes["@mozilla.org/network/io-service;1"].
            getService(Components.interfaces.nsIIOService);

        return ioServ.newURI(uriStr, null, null);
    }

    // Tag trees and clouds call this.  Really it should be somewhere only
    // pertinent to them, but here's convenient.
    function fireTagSelect(parentElt, tagId, tagName, event)
    {
        var e;

        e= document.createEvent("Events");
        e.initEvent("tagselect", true, false);
        e.selectedTagId= tagId;
        e.selectedTagTitle= tagName;
        if (event)
        {
            let props= ["shiftKey", "ctrlKey", "metaKey", "altKey", "button"];
            props.forEach(function (prop)
            {
                if (prop in event) e[prop]= event[prop];
            });
        }
        parentElt.dispatchEvent(e);
    }

    function forEachTag(callback)
    {
        var query;
        var result;

        query= histServ.getNewQuery();
        query.setFolders([bmServ.tagsFolder], 1);
        result= histServ.executeQuery(query, histServ.getNewQueryOptions());
        result.root.containerOpen= true;
        for (let i= 0; i < result.root.childCount; i++)
        {
            callback(result.root.getChild(i));
        }
        result.root.containerOpen= false;
    }

    function getControllerForCommand(cmd, startElt)
    {
        var cont;

        startElt= (startElt ||
                   top.document.popupNode ||
                   top.document.commandDispatcher.focusedElement);
        while (startElt)
        {
            if (startElt.controllers)
            {
                cont= startElt.controllers.getControllerForCommand(cmd);
                if (cont) return cont;
            }
            startElt= startElt.parentNode;
        }
        cont= top.document.commandDispatcher.getControllerForCommand(cmd);
        if (cont) return cont;
        return null;
    }

    function getFolderSize(folderId)
    {
        var query;
        var result;
        var size;

        query= histServ.getNewQuery();
        query.setFolders([folderId], 1);
        result= histServ.executeQuery(query, histServ.getNewQueryOptions());
        result.root.containerOpen= true;
        size= result.root.childCount;
        result.root.containerOpen= false;
        return size;
    }

    function getFolderTitle(folderId)
    {
        var query;
        var result;
        var title;

        query= histServ.getNewQuery();
        query.setFolders([folderId], 1);
        result= histServ.executeQuery(query, histServ.getNewQueryOptions());
        result.root.containerOpen= true;
        title= result.root.title;
        result.root.containerOpen= false;
        return title;
    }

    function getMaxTagSize()
    {
        var max;

        max= 0;
        forEachTag(function (to)
        {
            to.QueryInterface(CI.nsINavHistoryContainerResultNode);
            to.containerOpen= true;
            if (to.childCount > max) max= to.childCount;
            to.containerOpen= false;
        });
        return max;
    }

    // Returns "WINNT" on Windows Vista, XP, 2000, and NT systems;
    // "Linux" on GNU/Linux; and "Darwin" on Mac OS X.
    // See http://developer.mozilla.org/en/docs/
    // Code_snippets:Miscellaneous#Operating_system_detection
    function getOS()
    {
        return CC["@mozilla.org/xre/app-info;1"].
               getService(CI.nsIXULRuntime).OS;
    }

    function getStrings(bundleBasename)
    {
        return stringServ.createBundle("chrome://bookmarktags/locale/" +
                                       bundleBasename);
    }

    function goDoCommand(cmd, startElt)
    {
        var cont;

        cont= getControllerForCommand(cmd, startElt);
        if (cont && cont.isCommandEnabled(cmd)) cont.doCommand(cmd);
    }

    function goUpdateCommand(cmd, startElt)
    {
        var cont;

        cont= getControllerForCommand(cmd, startElt);
        goSetCommandEnabled(cmd, (cont ? cont.isCommandEnabled(cmd) : false));
    }

    function isTag(itemId)
    {
        return (bmServ.getFolderIdForItem(itemId) === bmServ.tagsFolder);
    }

    function isTaggedItem(itemId)
    {
        var uri;
        try
        {
            uri= bmServ.getBookmarkURI(itemId);
        }
        catch(exc)
        {
            return false;
        }
        if (uri)
        {
            let length= {};
            let tags= {};
            tagServ.getTagsForURI(uri, length, tags);
            return (length.value > 0);
        }
        return false;
    }

    function loadStylesheet(uriStr)
    {
        var uri;

        const styleServ=
            Components.classes["@mozilla.org/content/style-sheet-service;1"].
            getService(Components.interfaces.nsIStyleSheetService);

        uri= chromeURI(uriStr);
        if (!styleServ.sheetRegistered(uri, styleServ.USER_SHEET))
        {
            styleServ.loadAndRegisterSheet(uri, styleServ.USER_SHEET);
        }
    }

    // For unexpected errors that are our fault.
    function logBug(str)
    {
        logMsg("BUG " + str, true);
    }

    // For unexpected errors that aren't our fault.
    function logErr(str)
    {
        logMsg(":( " + str, true);
    }

    function logMsg(str, isError)
    {
        str= "TAGSIEVE " + str;

        if (isError) Components.utils.reportError(str);
        else
        {
            CC["@mozilla.org/consoleservice;1"].
                getService(CI.nsIConsoleService).
                logStringMessage(str);
        }
    }

    // see BookmarkObserver
    function makeBMObserver(callback)
    {
        var that;

        function F() {}
        F.prototype= new BookmarkObserver(callback);
        that= new F();
        that.childCheck= bmObserverChildCheck;
        that.onItemChanged= bmObserverOnItemChanged;
        that.onItemVisited= bmObserverOnItemVisited;
        that.parentCheck= bmObserverParentCheck;
        return that;
    }

    // see BookmarkObserver
    function makeTagObserver(callback)
    {
        var that;

        function F() {}
        F.prototype= new BookmarkObserver(callback);
        that= new F();
        that.childCheck= tagObserverChildCheck;
        that.onItemChanged= tagObserverOnItemChanged;
        that.parentCheck= tagObserverParentCheck;
        return that;
    }

    function prepareSortMenu(popup, sort, sortDir)
    {
        var sep;
        var allDirsHidden;

        allDirsHidden= true;
        for (let i= 0; i < popup.childNodes.length; i++)
        {
            let elt= popup.childNodes.item(i);
            switch (elt.localName)
            {
            case "menuitem":
                let sortOrDir= /\w+$/.exec(elt.getAttribute("command"))[0];
                if (sortOrDir === sort || sortOrDir === sortDir)
                {
                    elt.setAttribute("checked", "true");
                }
                else elt.removeAttribute("checked");

                // Past the separator are the sort direction menuitems.  Hide
                // the ones that are inappropriate for the current sort.
                if (sep)
                {
                    let name= elt.getAttribute("name");
                    if (name.split(/ /).indexOf(sort) < 0) elt.hidden= true;
                    else
                    {
                        elt.hidden= false;
                        allDirsHidden= false;
                    }
                }
                break;
            case "menuseparator":
                sep= elt;
                break;
            }
        }

        if (sep) sep.hidden= allDirsHidden;
    }

    function runBMBatch(callback)
    {
        var batch;

        batch= { runBatched: function (dummy) { callback(); } };
        bmServ.runInBatchMode(batch, null);
    }

    // Attached to tag observers.  See makeTagObserver.
    function tagObserverChildCheck(parentIds, childId)
    {
        if (parentIds)
        {
            return parentIds.some(function (id) id === bmServ.tagsFolder);
        }
        return isTag(childId);
    }

    // Attached to tag observers.  See makeTagObserver.
    function tagObserverOnItemChanged(itemId, property, isAnnoProperty, value)
    {
        var props; // This must contain column names in the bookmark SQL!

        props= ["lastModified"];
        if (property === "title") props.push("title");
        this.check(null, itemId, props, property, value);
    }

    // Attached to tag observers.  See makeTagObserver.
    function tagObserverParentCheck(parentId, childId)
    {
        return parentId === bmServ.tagsFolder;
    }

    function unloadStylesheet(uriStr)
    {
        var uri;

        const styleServ=
            Components.classes["@mozilla.org/content/style-sheet-service;1"].
            getService(Components.interfaces.nsIStyleSheetService);

        uri= chromeURI(uriStr);
        if (styleServ.sheetRegistered(uri, styleServ.USER_SHEET))
        {
            styleServ.unregisterSheet(uri, styleServ.USER_SHEET);
        }
    }

    return {
        CI:               CI,
        CC:               CC,
        HELP_URL:         HELP_URL,
        HOME_URL:         HOME_URL,

        bmServ:           bmServ,
        favIconServ:      favIconServ,
        histServ:         histServ,
        prefs:            prefs,
        stringServ:       stringServ,
        tagServ:          tagServ,

        fireTagSelect:    fireTagSelect,
        forEachTag:       forEachTag,
        getFolderSize:    getFolderSize,
        getFolderTitle:   getFolderTitle,
        getMaxTagSize:    getMaxTagSize,
        getOS:            getOS,
        getStrings:       getStrings,
        goDoCommand:      goDoCommand,
        goUpdateCommand:  goUpdateCommand,
        isTag:            isTag,
        isTaggedItem:     isTaggedItem,
        loadStylesheet:   loadStylesheet,
        logBug:           logBug,
        logErr:           logErr,
        logMsg:           logMsg,
        makeBMObserver:   makeBMObserver,
        makeTagObserver:  makeTagObserver,
        prepareSortMenu:  prepareSortMenu,
        runBMBatch:       runBMBatch,
        unloadStylesheet: unloadStylesheet
    };
}();

if (typeof(BookmarkTags) !== "undefined") BookmarkTags.Util= BookmarkTagsUtil;
