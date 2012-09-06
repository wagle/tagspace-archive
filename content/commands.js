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
 * Contributor(s):
 *
 * ***** END LICENSE BLOCK ***** */

// This nastiness is needed so our XPCOM component can access the objects here.
// Specifically it needs TagCmds.rewriteTagColorCSS.
var EXPORTED_SYMBOLS= ["BookmarkTags"];
if (typeof(BookmarkTags) === "undefined") var BookmarkTags= {};

// see content/browser/places/controller.js
BookmarkTags.BookmarkCmds= function ()
{
    const cmds=
    [
        "bookmarktags:bmCmds:copy",
        "bookmarktags:bmCmds:cutDelete",
        "bookmarktags:bmCmds:cutUntagAll",
        "bookmarktags:bmCmds:cutUntagTags",
        "bookmarktags:bmCmds:delete",
        "bookmarktags:bmCmds:open",
        "bookmarktags:bmCmds:openInNewWindow",
        "bookmarktags:bmCmds:openInNewTab",
        "bookmarktags:bmCmds:openInTabs",
        "bookmarktags:bmCmds:paste",
        "bookmarktags:bmCmds:properties",
        "bookmarktags:bmCmds:showInOrganizer",
        "bookmarktags:bmCmds:sort:x",
        "bookmarktags:bmCmds:sortDir:x",
        "bookmarktags:bmCmds:untagAll",
        "bookmarktags:bmCmds:untagTags"
    ];
    Components.utils.import("resource://gre/modules/PlacesUtils.jsm");
    Components.utils.import("resource:///modules/PlacesUIUtils.jsm");
    Components.utils.import('resource://gre/modules/Services.jsm');
    var clipid = Components.interfaces.nsIClipboard;  
    var clipboard = Components.classes["@mozilla.org/widget/clipboard;1"].getService(clipid);

    // Adapted from PlacesController.prototype._isClipboardDataPasteable in
    // firefox/source/browser/components/places/content/controller.js
    function canPaste()
    {
        var flavors;
        var transferable;

        // We can accept a place container right away.  TYPE_X_MOZ_PLACE would
        // also be immediately acceptable except we don't allow pasting of
        // livemarks, since the tree view doesn't handle them yet.
        flavors= [PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER];
        if (clipboard.hasDataMatchingFlavors(
                flavors,
                flavors.length,
                Components.interfaces.nsIClipboard.kGlobalClipboard))
        {
            return true;
        }

        // We can accept TYPE_X_MOZ_PLACE if it's not a livemark and the other
        // two flavors -- just plain text -- if they are valid URLs.
        transferable=
            Components.classes["@mozilla.org/widget/transferable;1"].
            createInstance(Components.interfaces.nsITransferable);
        transferable.addDataFlavor(PlacesUtils.TYPE_X_MOZ_PLACE);
        transferable.addDataFlavor(PlacesUtils.TYPE_X_MOZ_URL);
        transferable.addDataFlavor(PlacesUtils.TYPE_UNICODE);
        clipboard.getData(
            transferable, Components.interfaces.nsIClipboard.kGlobalClipboard);

        return canPasteHelper(transferable);
    }

    // Adapted from PlacesController.prototype._isClipboardDataPasteable in
    // firefox/source/browser/components/places/content/controller.js
    function canPasteHelper(transferable)
    {
        // transferable.getAnyTransferData and PlacesUtils.unwrapNodes will
        // throw if the data is not valid.
        try
        {
            let flavor= {};
            let data= {};

            transferable.getAnyTransferData(flavor, data, {});
            data=
                data.value.
                QueryInterface(Components.interfaces.nsISupportsString).data;

            if (flavor.value !== PlacesUtils.TYPE_X_MOZ_PLACE &&
                flavor.value !== PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER &&
                flavor.value !== PlacesUtils.TYPE_X_MOZ_URL &&
                flavor.value !== PlacesUtils.TYPE_UNICODE)
            {
                return false;
            }

            let nodes= PlacesUtils.unwrapNodes(data, flavor.value);
            let othersExist= false;
            let livemarksExist= false;

            for (let i= 0; i < nodes.length; i++)
            {
                if (!!nodes[i].livemark) livemarksExist= true;
                else othersExist= true;
            }
            return othersExist || !livemarksExist;
        }
        catch (exc) {}

        return false;
    }

    // Iterates over the menuitems of bmMenupopup, which should be a
    // bookmark menu popup, and collects and returns them as bookmark
    // objects.
    function collectBMMenuObjs(bmMenupopup)
    {
        var bmObjs;

        bmObjs= [];
        for (let i= 0; i < bmMenupopup.childNodes.length; i++)
        {
            let item= bmMenupopup.childNodes.item(i);
            if (item.hasAttribute("bmt-bmid")) bmObjs.push(makeBMMenuObj(item));
        }
        return bmObjs;
    }

    // Adapted from PlacesController.prototype.copy in
    // firefox/source/browser/components/places/content/controller.js
    function copy(bmObjs)
    {
        var mozURL;
        var unicode;
        var html;
        var mozPlace;
        var transferable;

        mozURL= "";
        unicode= "";
        html= "";
        mozPlace= "";

        for (let i= 0; i < bmObjs.length; i++)
        {
            let node= fakeNavHistoryResultNode(bmObjs[i]);
            let suffix= (i < bmObjs.length - 1 ? "\n" : "");

            mozPlace +=
                PlacesUtils.wrapNode(
                    node, PlacesUtils.TYPE_X_MOZ_PLACE, null, true) +
                (i < bmObjs.length - 1 ? "," : "");
            mozURL +=
                PlacesUtils.wrapNode(
                    node, PlacesUtils.TYPE_X_MOZ_URL, null, true) +
                suffix;
            unicode +=
                PlacesUtils.wrapNode(
                    node, PlacesUtils.TYPE_UNICODE, null, true) +
                suffix;
            html +=
                PlacesUtils.wrapNode(node, PlacesUtils.TYPE_HTML, null, true) +
                suffix;
        }

        transferable=
            Components.classes["@mozilla.org/widget/transferable;1"].
            createInstance(Components.interfaces.nsITransferable);

        // order matters here
        [[mozPlace, PlacesUtils.TYPE_X_MOZ_PLACE],
         [mozURL,   PlacesUtils.TYPE_X_MOZ_URL],
         [unicode,  PlacesUtils.TYPE_UNICODE],
         [html,     PlacesUtils.TYPE_HTML]].
        forEach(function (a)
        {
            if (a[0])
            {
                dataExists= true;
                transferable.addDataFlavor(a[1]);
                transferable.setTransferData(
                    a[1], PlacesUIUtils._wrapString(a[0]), a[0].length * 2);
            }
        });

        if (mozPlace || unicode || html || mozURL)
        {
            clipboard.setData(transferable, null,
                Components.interfaces.nsIClipboard.kGlobalClipboard);
        }
    }

    function cutDelete(bmObjs)
    {
        copy(bmObjs);
        doDelete(bmObjs);
    }

    function cutUntagAll(bmObjs)
    {
        copy(bmObjs);
        untagAll(bmObjs);
    }

    function cutUntagTags(bmObjs, tagIds)
    {
        copy(bmObjs);
        untagTags(bmObjs, tagIds);
    }

    function doDelete(bmObjs)
    {
        var transactions;

        transactions= [];
        bmObjs.forEach(function (bmObj)
        {
            transactions.push(new PlacesRemoveItemTransaction(bmObj.id));
        });
        doTransactions(transactions, "bookmarktags:bmCmds:delete");
    }

    // Aggregates transactions under the name cmd and runs them in a bookmarks
    // service batch.
    function doTransactions(transactions, cmd)
    {
        if (transactions.length > 0)
        {
            transactions= new PlacesAggregatedTransaction(cmd, transactions);
            BookmarkTags.Util.runBMBatch(function ()
            {
                PlacesUtils.transactionManager.doTransaction(transactions);
            });
        }
    }

    function fakeNavHistoryResultNode(bmObj)
    {
        return {
            itemId: bmObj.id,
            title:  bmObj.title,
            uri:    bmObj.url,
            type:   Components.interfaces.nsINavHistoryResultNode.
                        RESULT_TYPE_URI
        };
    }

    function getDragSession()
    {
        return Components.classes["@mozilla.org/widget/dragservice;1"].
               getService(Components.interfaces.nsIDragService).
               getCurrentSession();
    }

    function getTagNames(tagIds)
    {
        var tagNames;

        tagNames= [];
        tagIds.forEach(function (tid)
        {
            let title= BookmarkTags.Util.bmServ.getItemTitle(tid);
            if (title) tagNames.push(title);
        });
        return tagNames;
    }

    // Adapted from PlacesController.prototype.paste in
    // firefox/source/browser/components/places/content/controller.js
    function handleDragDrop(tagIds)
    {
        var transferable;
        var transactions;
        var bms;
        var tagNames;
        var dragSession;

        transferable= makePasteTransferable();
        transactions= [];
        bms= [];
        tagNames= getTagNames(tagIds);
        dragSession= getDragSession();

        for (let i= 0; i < dragSession.numDropItems; i++)
        {
            dragSession.getData(transferable, i);
            pasteHelper(tagNames, transferable, transactions, bms);
        }

        doTransactions(transactions, "bookmarktags:bmCmds:drop");
        return bms;
    }

    // Adapted from PlacesController.prototype.getTransferData at
    // firefox/source/browser/components/places/content/controller.js.
    function handleDragGesture(bmObjs, event, transferData, dragAction)
    {
        // Firefox behavior:
        //   - dragging from tag folder to non tag folder leaves tags in place
        //     but moves bookmark from parent folder to new folder; it's as if
        //     you went to parent folder and dragged it from there
        //   - holding option copies, so the only difference is that the bm is
        //     not removed from parent folder
        //   - so, by dragging there's no way to remove tags

        var dataset;

        // TransferDataSet et al. in chrome://global/content/nsDragAndDrop.js
        dataset= new TransferDataSet();

        bmObjs.forEach(function (bmObj)
        {
            let node= fakeNavHistoryResultNode(bmObj);
            let data= new TransferData();

            [PlacesUtils.TYPE_X_MOZ_PLACE,
             PlacesUtils.TYPE_X_MOZ_URL,
             PlacesUtils.TYPE_UNICODE,
             PlacesUtils.TYPE_HTML].
            forEach(function (flav)
            {
                let copy= true;
                let wnode= PlacesUtils.wrapNode(node, flav, null, copy);
                data.addDataForFlavour(
                    flav, PlacesUIUtils._wrapString(wnode));
            });

            dataset.push(data);
        });

        transferData.data= dataset;
    }

    // Adapted from PlacesController.prototype._isClipboardDataPasteable in
    // firefox/source/browser/components/places/content/controller.js
    function handleDragOver()
    {
        var dragSession;
        var transferable;

        dragSession= getDragSession();

        // See notes in canPaste about flavors we can accept.

        if (dragSession.isDataFlavorSupported(
                PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER))
        {
            dragSession.canDrop= true;
            return true;
        }

        transferable=
            Components.classes["@mozilla.org/widget/transferable;1"].
            createInstance(Components.interfaces.nsITransferable);
        transferable.addDataFlavor(PlacesUtils.TYPE_X_MOZ_PLACE);
        transferable.addDataFlavor(PlacesUtils.TYPE_X_MOZ_URL);
        transferable.addDataFlavor(PlacesUtils.TYPE_UNICODE);

        for (let i= 0; i < dragSession.numDropItems; i++)
        {
            dragSession.getData(transferable, i);
            if (canPasteHelper(transferable))
            {
                dragSession.canDrop= true;
                return true;
            }
        }

        dragSession.canDrop= false;
        return false;
    }

    function isSortCmd(cmd)
    {
        var match;

        match= /^bookmarktags:bmCmds:(sort(Dir)?):(\w+)$/.exec(cmd);
        if (match) return [match[1], match[3]];
        return null;
    }

    function makeBMMenuObj(bmMenuitem)
    {
        return {
            id:    parseInt(bmMenuitem.getAttribute("bmt-bmid")),
            title: bmMenuitem.getAttribute("bmt-bmname"),
            url:   bmMenuitem.getAttribute("bmt-bmurl")
        };
    }

    // Used by paste and handleDragDrop.
    function makePasteTransferable()
    {
        var transferable;

        transferable=
            Components.classes["@mozilla.org/widget/transferable;1"].
            createInstance(Components.interfaces.nsITransferable);

        [PlacesUtils.TYPE_X_MOZ_PLACE,
         PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER,
         PlacesUtils.TYPE_X_MOZ_URL,
         PlacesUtils.TYPE_UNICODE].
        forEach(function (flav) transferable.addDataFlavor(flav));

        return transferable;
    }

    function open_(bmObj, where)
    {
        var window = Services.wm.getMostRecentWindow("navigator:browser");
        PlacesUIUtils._openNodeIn(fakeNavHistoryResultNode(bmObj), where, window);
    }

    function open(bmObj)
    {
        open_(bmObj, "current");
    }

    function openInNewWindow(bmObj)
    {
        open_(bmObj, "window");
    }

    function openInNewTab(bmObj)
    {
        open_(bmObj, "tab");
    }

    function openInTabs(bmObjs)
    {
        openInTabsWithEvent(bmObjs, null);
    }

    // event may be null.
    function openInTabsWithEvent(bmObjs, event)
    {
        if (PlacesUIUtils._confirmOpenInTabs(bmObjs.length))
        {
            bmObjs= bmObjs.map(function (bmObj)
            {
                return { uri: bmObj.url, isBookmark: true };
            });
            PlacesUIUtils._openTabset(bmObjs, event, Services.wm.getMostRecentWindow("navigator:browser"));
        }
    }

    function openWithEvent(bmObj, event)
    {
        var window = Services.wm.getMostRecentWindow("navigator:browser");
        PlacesUIUtils._openNodeIn(fakeNavHistoryResultNode(bmObj), window.whereToOpenLink(event), window);
    }

    // Adapted from PlacesController.prototype.paste in
    // firefox/source/browser/components/places/content/controller.js
    function paste(tagIds)
    {
        var transferable;
        var transactions;
        var bms;
        var tagNames;

        transferable= makePasteTransferable();
        clipboard.getData(
            transferable, Components.interfaces.nsIClipboard.kGlobalClipboard);

        transactions= [];
        bms= [];
        tagNames= getTagNames(tagIds);

        pasteHelper(tagNames, transferable, transactions, bms);
        doTransactions(transactions, "bookmarktags:bmCmds:paste");
        return bms;
    }

    // Adapted from PlacesController.prototype.paste in
    // firefox/source/browser/components/places/content/controller.js
    function pasteHelper(tagNames, transferable, transactions, bms)
    {
        const ioServ=
            Components.classes["@mozilla.org/network/io-service;1"].
            getService(Components.interfaces.nsIIOService);

        // transferable.getAnyTransferData and PlacesUtils.unwrapNodes will
        // throw if the data is not valid.
        try
        {
            let flavor= {};
            let data= {};

            transferable.getAnyTransferData(flavor, data, {});
            data=
                data.value.
                QueryInterface(Components.interfaces.nsISupportsString).data;

            let items=
                processNodes(PlacesUtils.unwrapNodes(data, flavor.value));

            for (let i= 0; i < items.length; i++)
            {
                let item= items[i];
                let uri= ioServ.newURI(item.uri, null, null);
                let existingTags=
                    BookmarkTags.Util.tagServ.getTagsForURI(uri, {}, {});
                let newTags=
                    tagNames.filter(function (t) existingTags.indexOf(t) < 0);
                transactions.push(new PlacesTagURITransaction(uri, newTags));
                // item.id will be defined for regular Places nodes, item.itemId
                // for nsINavHistoryResultNodes, which are returned from
                // processNavQueryNodeHelper
                bms.push({ id: (item.id || item.itemId), uri: uri });
            }
        }
        catch (exc) {}
    }

    // processNodes helper.
    function processNavQueryNode(node)
    {
        var navQueries;
        var cnt;
        var opts;
        var res;

        const histServ=
            Components.classes["@mozilla.org/browser/nav-history-service;1"].
            getService(Components.interfaces.nsINavHistoryService);

        navQueries= {};
        cnt= {};
        opts= {};
        histServ.queryStringToQueries(node.uri, navQueries, cnt, opts);

        opts.value.expandQueries= true;
        res= histServ.executeQueries(navQueries.value, cnt.value, opts.value);

        return processNavQueryNodeHelper(res.root);
    }

    // node must be an nsINavHistoryResultNode, which is the type returned by
    // nsINavHistoryService's query execution methods.  Returns an array of
    // nsINavHistoryResultNodes that are reachable from node, i.e., recurses
    // into container nodes.  If node is not a container, returns a single-
    // element array containing node.  If we don't handle node (e.g., it's a
    // separator) returns an empty array.
    function processNavQueryNodeHelper(node)
    {
        switch (node.type)
        {
        case node.RESULT_TYPE_QUERY:
        case node.RESULT_TYPE_FOLDER:
        case node.RESULT_TYPE_FOLDER_SHORTCUT:
        case node.RESULT_TYPE_DYNAMIC_CONTAINER:
            let children= [];
            node.QueryInterface(
                Components.interfaces.nsINavHistoryContainerResultNode);
            node.containerOpen= true;
            for (let i= 0; i < node.childCount; i++)
            {
                let child= node.getChild(i);
                children= children.concat(processNavQueryNodeHelper(child));
            }
            node.containerOpen= false;
            return children;
            break;
        case node.RESULT_TYPE_URI:
        case node.RESULT_TYPE_VISIT:
        case node.RESULT_TYPE_FULL_VISIT:
            return [node];
            break;
        }

        return [];
    }

    // Traverses nodes, descending into any containers, and returns all nodes in
    // an array.
    function processNodes(nodes)
    {
        var newNodes;
        var children;

        newNodes= [];
        for (let i= 0; i < nodes.length; i++)
        {
            let node= nodes[i];

            switch (node.type)
            {
            case PlacesUtils.TYPE_X_MOZ_PLACE_CONTAINER:
                children= processNodes(node.children);
                newNodes= newNodes.concat(children);
                break;
            case PlacesUtils.TYPE_X_MOZ_PLACE:
                // If node is a Places query it is not distinguished in any way
                // except that its URI protocol is "place", e.g.,
                // "place:sort=8&maxResults=10".
                if (/^place:/.test(node.uri))
                {
                    children= processNavQueryNode(node);
                    newNodes= newNodes.concat(children);
                    break;
                }
                // fall through
            case PlacesUtils.TYPE_X_MOZ_URL:
            case PlacesUtils.TYPE_UNICODE:
                newNodes.push(node);
                break;
            }
        }
        return newNodes;
    }

    function properties(bmObj)
    {
        var info=
        {
            action: "edit",
            type: "bookmark",
            itemId: bmObj.id
        };
        var window = Services.wm.getMostRecentWindow("navigator:browser");
        PlacesUIUtils.showBookmarkDialog(info, window);
    }

    // See SidebarUtils.handleTreeClick at
    // firefox/source/browser/components/places/content/sidebarUtils.js
    function shouldClickOpenInTabs(event)
    {
        if (event.button !== undefined)
        {
            if (event.button === 1) return true;
            if (event.button === 0)
            {
                if (BookmarkTags.Util.getOS() === "Darwin")
                {
                    return event.metaKey || event.shiftKey;
                }
                return event.ctrlKey || event.shiftKey;
            }
        }
        return false;
    }

    // Opens the Places organizer (or brings it to the front if it's already
    // open) and selects bmId's parent folder in the left pane and bmId in
    // the main pane.
    function showInOrganizer(bmId)
    {
        var organizerWin;
        var leftPane;
        var mainPane;
        var parentId;

        const leftPaneRoot= "AllBookmarks";

        organizerWin=
            Components.classes["@mozilla.org/appshell/window-mediator;1"].
            getService(Components.interfaces.nsIWindowMediator).
            getMostRecentWindow("Places:Organizer");

        if (!organizerWin)
        {
            let onload= function ()
            {
                organizerWin.removeEventListener("load", onload, false);
                organizerWin.setTimeout(function ()
                {
                    showInOrganizerHelper(bmId, organizerWin);
                }, 0);
            };

            organizerWin=
                openDialog("chrome://browser/content/places/places.xul",
                           "",
                           "chrome,toolbar=yes,dialog=no,resizable",
                           leftPaneRoot);

            organizerWin.addEventListener("load", onload, false);
        }
        else
        {
            organizerWin.PlacesOrganizer.selectLeftPaneQuery(leftPaneRoot);
            organizerWin.focus();
            showInOrganizerHelper(bmId, organizerWin);
        }
    }

    function showInOrganizerHelper(bmId, organizerWin)
    {
        var leftPane;
        var mainPane;
        var parentId;

        leftPane= organizerWin.document.getElementById("placesList");
        mainPane= organizerWin.document.getElementById("placeContent");

        try
        {
            parentId= BookmarkTags.Util.bmServ.getFolderIdForItem(bmId);

            leftPane.selectItems([parentId]);
            mainPane.selectItems([bmId]);

            leftPane.treeBoxObject.ensureRowIsVisible(
                leftPane.view.treeIndexForNode(leftPane.selectedNode));
            mainPane.treeBoxObject.ensureRowIsVisible(
                mainPane.view.treeIndexForNode(mainPane.selectedNode));
        }
        catch (exc) {}
    }

    // Removes all tags from the bookmarks in bmObjs.
    function untagAll(bmObjs)
    {
        var transactions;

        transactions= [];
        bmObjs.forEach(function (bmObj)
        {
            let uri= BookmarkTags.Util.bmServ.getBookmarkURI(bmObj.id);
            if (uri) transactions.push(new PlacesUntagURITransaction(uri, null));
        });
        doTransactions(transactions, "bookmarktags:bmCmds:untagAll");
    }

    // Removes the tags in tagIds from the bookmarks in bmObjs.
    // WARNING: Every bookmark in bmObjs must be tagged by all tags in tagIds.
    // As we currently call this function -- from the user's context menu on
    // a bookmark either in the bmtree or tag menu -- that's not a problem.  See
    // nsIPlacesTransactionsService.idl.
    function untagTags(bmObjs, tagIds)
    {
        var tagNames;

        tagNames= getTagNames(tagIds);

        if (tagNames.length > 0)
        {
            let transactions= [];

            bmObjs.forEach(function (bmObj)
            {
                let uri= BookmarkTags.Util.bmServ.getBookmarkURI(bmObj.id);
                if (uri)
                {
                    transactions.push(new PlacesUntagURITransaction(uri, tagNames));
                }
            });
            doTransactions(transactions, "bookmarktags:bmCmds:untagTags");
        }
    }

    function update()
    {
        cmds.forEach(function (cmd) BookmarkTags.Util.goUpdateCommand(cmd));
    }

    return {
        canPaste:              canPaste,
        copy:                  copy,
        collectBMMenuObjs:     collectBMMenuObjs,
        cutDelete:             cutDelete,
        cutUntagAll:           cutUntagAll,
        cutUntagTags:          cutUntagTags,
        doDelete:              doDelete,
        doTransactions:        doTransactions,
        handleDragDrop:        handleDragDrop,
        handleDragGesture:     handleDragGesture,
        handleDragOver:        handleDragOver,
        isSortCmd:             isSortCmd,
        makeBMMenuObj:         makeBMMenuObj,
        open:                  open,
        openInNewWindow:       openInNewWindow,
        openInNewTab:          openInNewTab,
        openInTabs:            openInTabs,
        openInTabsWithEvent:   openInTabsWithEvent,
        openWithEvent:         openWithEvent,
        paste:                 paste,
        properties:            properties,
        shouldClickOpenInTabs: shouldClickOpenInTabs,
        showInOrganizer:       showInOrganizer,
        update:                update,
        untagAll:              untagAll,
        untagTags:             untagTags
    };
}();



BookmarkTags.QueryCmds= function ()
{
    const cmds=
    [
        "bookmarktags:queryCmds:customize",
        "bookmarktags:queryCmds:help",
        "bookmarktags:queryCmds:removeSucceedingTags",
        "bookmarktags:queryCmds:removeTag",
        "bookmarktags:queryCmds:removeOtherTags",
        "bookmarktags:queryCmds:removeAllTags",
        "bookmarktags:queryCmds:toggleFindAsYouType"
    ];

    const QUERY_CLICK_SUCC=   0;
    const QUERY_CLICK_TAG=    1;
    const QUERY_CLICK_OTHERS= 2;

    function doCommand(cmdName)
    {
        var currVal;

        // Other commands must be handled ad hoc, i.e., by the query builder,
        // since it controls the query itself.
        switch (cmdName)
        {
        case "bookmarktags:queryCmds:customize":
            window.openDialog("chrome://bookmarktags/content/prefs.xul", "",
                              "chrome,centerscreen", "sidebar");
            break;
        case "bookmarktags:queryCmds:toggleFindAsYouType":
            currVal= BookmarkTags.Util.prefs.
                     getBoolPref("disableFindAsYouType");
            BookmarkTags.Util.prefs.setBoolPref("disableFindAsYouType",
                                                !currVal);
            break;
        case "bookmarktags:queryCmds:help":
            openUILinkIn(BookmarkTags.Util.HELP_URL, "tab");
            break;
        }
    }

    function supportsCommand(cmdName)
    {
        return cmds.indexOf(cmdName) >= 0;
    }

    function update()
    {
        cmds.forEach(function (cmd) BookmarkTags.Util.goUpdateCommand(cmd));
    }

    return {
        QUERY_CLICK_SUCC:   QUERY_CLICK_SUCC,
        QUERY_CLICK_TAG:    QUERY_CLICK_TAG,
        QUERY_CLICK_OTHERS: QUERY_CLICK_OTHERS,
        doCommand:          doCommand,
        supportsCommand:    supportsCommand,
        update:             update
    };
}();



BookmarkTags.TagCmds= function ()
{
    const cmds=
    [
        "bookmarktags:tagCmds:copy",
        "bookmarktags:tagCmds:cut",
        "bookmarktags:tagCmds:delete",
        "bookmarktags:tagCmds:openInTabs",
        "bookmarktags:tagCmds:paste",
        "bookmarktags:tagCmds:properties",
        "bookmarktags:tagCmds:select",
        "bookmarktags:tagCmds:setTagColor:x"
    ];

    const CSS_BASENAME= "tagsieve.css";

    const CI= Components.interfaces;
    const CC= Components.classes;

    function cloneQueryWithTag(query, tagId)
    {
        var newQuery;

        newQuery= query.clone();
        newQuery.intersectTag(tagId, null);
        newQuery.executeBM();
        return newQuery;
    }

    // Really copy and cut should be able to take multiple tag IDs, and then
    // do a copy of query & (tagId_1 + tagId_2 + ... + tagId_n), but the
    // Query prototype operations aren't advanced enough (yet).  Anyway,
    // the tag browser sidebar allows only single tag selection currently,
    // so it's not a problem.
    function copy(tagId, query)
    {
        BookmarkTags.BookmarkCmds.copy(cloneQueryWithTag(query, tagId).bmArr);
    }

    // Currently this is called only when query is empty.
    function cut(tagId, query)
    {
        copy(tagId, query);
        doDelete([tagId]);
    }

    // Currently this is called only when the sidebar's query is empty.
    function doDelete(tagIds)
    {
        var transactions;

        if (okToDelete(tagIds))
        {
            transactions= [];
            tagIds.forEach(function (tid)
            {
                transactions.push(new PlacesRemoveItemTransaction(tid));
            });
            BookmarkTags.BookmarkCmds.doTransactions(
                transactions, "bookmarktags:tagCmds:delete");
        }
    }

    function properties(tagId)
    {
        var info=
        {
            action: "edit",
            type: "folder",
            itemId: tagId
        };
        PlacesUIUtils.showBookmarkDialog(info);
    }

    function getCSSFile()
    {
        var file;

        file= CC["@mozilla.org/file/directory_service;1"].
              getService(CI.nsIProperties).
              get("UChrm", CI.nsIFile);
	if (!file.exists() || !file.isDirectory())
	    file.create(CI.nsIFile.DIRECTORY_TYPE, 0777);
        file.append(CSS_BASENAME);
        return file;
    }

    function getColorHash(cssFile)
    {
        var stream;
        var colorHash;

        stream=
            CC["@mozilla.org/network/file-input-stream;1"].
            createInstance(CI.nsIFileInputStream);
        try
        {
            let line= {};
            stream.init(cssFile, -1, -1, 0);
            stream.QueryInterface(CI.nsILineInputStream).
                readLine(line);
            line= /\/\*(.*)\*\//.exec(line.value)[1];
            colorHash= JSON.parse(line);
        }
        catch (exc)
        {
            colorHash= {};
        }
        finally
        {
            stream.close();
        }

        return colorHash;
    }

    function globalCSS()
    {
        var css;

        // see tree.css of the various platform themes

        if (BookmarkTags.Util.getOS() === "Darwin")
        {
            css= [
                'tree[type="bookmarktags:tagtree"] ',
                'treechildren::-moz-tree-row(selected) { ',
                   'background-color: -moz-mac-secondaryhighlight !important; ',
                '}\n',
                'tree[type="bookmarktags:tagtree"] ',
                'treechildren::-moz-tree-cell-text(selected) { ',
                    'color: -moz-DialogText !important; ',
                '}\n'
            ].join("");
        }
        else
        {
            css= [
                'tree[type="bookmarktags:tagtree"] ',
                'treechildren::-moz-tree-row(selected) { ',
                    'background-color: -moz-cellhighlight !important; ',
                '}\n',
                'tree[type="bookmarktags:tagtree"] ',
                'treechildren::-moz-tree-cell-text(selected) { ',
                    'color: -moz-cellhighlighttext !important; ',
                '}\n'
            ].join("");
        }

        css= [
            css,
            'tree[type="bookmarktags:tagtree"] ',
            'treechildren::-moz-tree-row(selected, focus) { ',
                'background-color: Highlight !important; ',
            '}\n',
            'tree[type="bookmarktags:tagtree"] ',
            'treechildren::-moz-tree-cell-text(selected, focus) { ',
                'color: HighlightText !important; ',
            '}\n'
        ].join("");

        return css;
    }

    function isSetColorCmd(cmd, outColor)
    {
        var match;

        match= /^bookmarktags:tagCmds:setTagColor:(.*)$/.exec(cmd);
        if (match)
        {
            if (outColor) outColor.value= match[1];
            return true;
        }
        return false;
    }

    function loadStyle(cssFile)
    {
        const ioServ=
            CC["@mozilla.org/network/io-service;1"].
            getService(CI.nsIIOService);
        const styleServ=
            CC["@mozilla.org/content/style-sheet-service;1"].
            getService(CI.nsIStyleSheetService);

        if (!cssFile) cssFile= getCSSFile();
        try
        {
            let uri= ioServ.newFileURI(cssFile);
            if (styleServ.sheetRegistered(uri, styleServ.USER_SHEET))
            {
                styleServ.unregisterSheet(uri, styleServ.USER_SHEET);
            }
            styleServ.loadAndRegisterSheet(uri, styleServ.USER_SHEET);
        }
        catch (exc) {}
    }

    // Shows the user a warning prompt about tag deletion, unless the user has
    // previously chosen to suppress the message.  If suppressed or the user
    // clicks OK, returns true.
    function okToDelete(tagIds)
    {
        var title;
        var msg;
        var deleteBtn;
        var cancelBtn;
        var suppress;

        if (BookmarkTags.Util.prefs.getBoolPref("warnOnTagDelete"))
        {
            let str= BookmarkTags.Util.getStrings("commands.properties");

            let tagNames= tagIds.map(function (tid)
            {
                return BookmarkTags.Util.bmServ.getItemTitle(tid);
            });

            if (tagIds.length <= 1)
            {
                title= str.GetStringFromName("deleteTagWarning.titleSingle");
                msg= str.GetStringFromName("deleteTagWarning.messageSingle");
                deleteBtn=
                    str.GetStringFromName(
                        "deleteTagWarning.deleteSingleButtonLabel");
            }
            else
            {
                title= str.GetStringFromName("deleteTagWarning.titleMultiple");
                msg= str.GetStringFromName("deleteTagWarning.messageMultiple");
                deleteBtn=
                    str.GetStringFromName(
                        "deleteTagWarning.deleteMultipleButtonLabel");
            }

            msg= msg.replace("**TAG**", tagNames.join(", "));
            cancelBtn=
                str.GetStringFromName("deleteTagWarning.cancelButtonLabel");
            suppress= str.GetStringFromName("deleteTagWarning.suppressLabel");

            let checkState= { value: false };
            let buttonFlags=
                Components.interfaces.nsIPromptService.BUTTON_TITLE_IS_STRING *
                (Components.interfaces.nsIPromptService.BUTTON_POS_0 +
                 Components.interfaces.nsIPromptService.BUTTON_POS_1);
            let buttonPress=
                Components.classes["@mozilla.org/embedcomp/prompt-service;1"].
                getService(Components.interfaces.nsIPromptService).
                confirmEx(null, title, msg, buttonFlags, deleteBtn, cancelBtn,
                          null, suppress, checkState);

            if (buttonPress === 0)
            {
                if (checkState.value)
                {
                    BookmarkTags.Util.prefs.setBoolPref(
                        "warnOnTagDelete", false);
                }
                return true;
            }
            return false;
        }
        return true;
    }

    // Just a convenience wrapper for BookmarkCmds.openInTabsWithEvent.
    // Intersects tagId with query to generate the bookmark set.  event may be
    // unspecified.
    function openInTabs(tagId, query, event)
    {
        query= cloneQueryWithTag(query, tagId);
        BookmarkTags.BookmarkCmds.openInTabsWithEvent(query.bmArr, event);
    }

    // Simply loads the JSON from the CSS file and writes back the CSS rules.
    // Needed because the CSS selectors changed in version 4.0.0.
    function rewriteTagColorCSS()
    {
        var cssFile;
        var colorHash;

        cssFile= getCSSFile();
        if (cssFile.exists())
        {
            colorHash= getColorHash(cssFile);
            writeCSS(cssFile, colorHash);
            loadStyle(cssFile);
        }
    }

    // Writes the CSS with the new tag color and reloads it.  If the color was
    // set in a tag tree, pass in the tree; its style cache will need to be
    // cleared to make the color in the UI stick.  rgbStr may be unspecified,
    // in which case the tag's color is cleared.
    function setTagColor(tagId, rgbStr, tagTree)
    {
        var cssFile;
        var colorHash;

        cssFile= getCSSFile();
        colorHash= getColorHash(cssFile);
        if (rgbStr) colorHash[tagId]= rgbStr;
        else delete colorHash[tagId];
        writeCSS(cssFile, colorHash);
        loadStyle(cssFile);

        if (tagTree)
        {
            try
            {
                tagTree.treeBoxObject.clearStyleAndImageCaches();
            }
            catch (e) {}
        }
    }

    function tagCSS(tagId, rgbStr)
    {
        var txtColor;

        txtColor= textColor(rgbStr);
        return [
            // cloud label
            'box[type="bookmarktags:tagcloud"] ',
            'label[bmt-tagid="', tagId, '"] { ',
                'background-color: ', rgbStr, ' !important; ',
                'color: ', txtColor, ' !important; ',
                '-moz-border-radius: 3px !important; ',
            '}\n',
            // cloud label hover
            'box[type="bookmarktags:tagcloud"] ',
            'label[bmt-tagid="', tagId, '"]:hover { ',
                'opacity: 0.75 !important; ',
                'text-decoration: none !important; ',
            '}\n',
            // tree row text
            'tree[type="bookmarktags:tagtree"] ',
            'treechildren::-moz-tree-cell-text(bmt_tagid_', tagId, ') { ',
                'color: ', txtColor, ' !important; ',
            '}\n',
            // tree row background color
            'tree[type="bookmarktags:tagtree"] ',
            'treechildren::-moz-tree-row(bmt_tagid_', tagId, ') { ',
                'background-color: ', rgbStr, ' !important; ',
            '}\n'
        ].join("");
    }

    function textColor(bgRGBStr)
    {
        var rgb;
        var hsl;

        rgb= BookmarkTags.Color.hexStrToRGB(bgRGBStr);
        hsl= BookmarkTags.Color.rgbToHSL(rgb);

        //if (BookmarkTags.Color.luminance(rgb) <= 0.64) hsl.l= 0.9;
        //else hsl.l= 0.2;
        if (BookmarkTags.Color.luminance(rgb) <= 0.64) hsl.l= 1;
        else hsl.l= 0;

        return BookmarkTags.Color.rgbToHexStr(BookmarkTags.Color.hslToRGB(hsl));
    }

    function update()
    {
        cmds.forEach(function (cmd) BookmarkTags.Util.goUpdateCommand(cmd));
    }

    function writeCSS(file, colorHash)
    {
        var stream;
        var line;

        stream= CC["@mozilla.org/network/file-output-stream;1"].
                createInstance(CI.nsIFileOutputStream);

        try
        {
            // 0x02 PR_WRONLY
            // 0x08 PR_CREATE_FILE
            // 0x20 PR_TRUNCATE
            // see /nsprpub/pr/include/prio.h
            stream.init(file, 0x02 | 0x08 | 0x20, 0664, 0);

            // JSON header
            line= "/* " + JSON.stringify(colorHash) + " */\n";
            stream.write(line, line.length);

            // XUL namespace
            line= '@namespace url("http://www.mozilla.org/keymaster/gatekeeper/there.is.only.xul");\n';
            stream.write(line, line.length);

            // CSS for each tag
            for (let tagId in colorHash)
            {
                line= tagCSS(tagId, colorHash[tagId]);
                stream.write(line, line.length);
            }

            // tag-independent CSS
            line= globalCSS();
            stream.write(line, line.length);

            stream.flush();
        }
        catch (exc) {}
        finally
        {
            stream.close();
        }
    }

    return {
        copy:               copy,
        cut:                cut,
        doDelete:           doDelete,
        isSetColorCmd:      isSetColorCmd,
        loadStyle:          loadStyle,
        openInTabs:         openInTabs,
        properties:         properties,
        rewriteTagColorCSS: rewriteTagColorCSS,
        setTagColor:        setTagColor,
        update:             update
    };
}();



BookmarkTags.TagDisplayCmds= function ()
{
    const cmds=
    [
        "bookmarktags:tagDisplayCmds:cloud",
        "bookmarktags:tagDisplayCmds:customize",
        "bookmarktags:tagDisplayCmds:list",
        "bookmarktags:tagDisplayCmds:help",
        "bookmarktags:tagDisplayCmds:sort:x",
        "bookmarktags:tagDisplayCmds:sortDir:x"
    ];

    const DISPLAY_CLOUD= 0;
    const DISPLAY_LIST=  1;

    function cloud()
    {
        BookmarkTags.Util.prefs.setIntPref("tagDisplay", DISPLAY_CLOUD);
    }

    function customize()
    {
        window.openDialog("chrome://bookmarktags/content/prefs.xul", "",
                          "chrome,centerscreen", "sidebar");
    }

    function help()
    {
        openUILinkIn(BookmarkTags.Util.HELP_URL, "tab");
    }

    function isSortCmd(cmd)
    {
        var match;

        match= /^bookmarktags:tagDisplayCmds:(sort(Dir)?):(\w+)$/.exec(cmd);
        if (match) return [match[1], match[3]];
        return null;
    }

    function list()
    {
        BookmarkTags.Util.prefs.setIntPref("tagDisplay", DISPLAY_LIST);
    }

    function update()
    {
        cmds.forEach(function (cmd) BookmarkTags.Util.goUpdateCommand(cmd));
    }

    return {
        DISPLAY_CLOUD: DISPLAY_CLOUD,
        DISPLAY_LIST:  DISPLAY_LIST,
        cloud:         cloud,
        customize:     customize,
        help:          help,
        isSortCmd:     isSortCmd,
        list:          list,
        update:        update
    };
}();



BookmarkTags.TagInputCmds= function ()
{
    const cmds=
    [
        "bookmarktags:tagInputCmds:toggleAutocomplete",
        "bookmarktags:tagInputCmds:help"
    ];

    function doCommand(cmdName)
    {
        var currVal;

        switch (cmdName)
        {
        case "bookmarktags:tagInputCmds:toggleAutocomplete":
            currVal=
                BookmarkTags.Util.prefs.
                getBoolPref("disableTagInputAutocomplete");
            BookmarkTags.Util.prefs.
                setBoolPref("disableTagInputAutocomplete", !currVal);
            break;
        case "bookmarktags:tagInputCmds:help":
            openUILinkIn(BookmarkTags.Util.HELP_URL, "tab");
            break;
        }
    }

    function supportsCommand(cmd)
    {
        return cmds.indexOf(cmd) >= 0;
    }

    function update()
    {
        cmds.forEach(function (cmd) BookmarkTags.Util.goUpdateCommand(cmd));
    }

    return {
        doCommand:        doCommand,
        supportsCommand:  supportsCommand,
        update:           update
    };
}();
