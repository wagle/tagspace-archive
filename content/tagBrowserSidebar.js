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

var BookmarkTags= function ()
{
    var bmTree;
    var queryCloud;
    var tagSelector;
    var queryBuilder;
    var splitter;
    var macCSSLoaded;

    // for edit commands

    const bmController=
    {
        doCommand: function (cmd)
        {
            var selBM;

            selBM= bmTree.view.selectedObj;

            switch (cmd)
            {
            case "bookmarktags:bmCmds:copy":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.copy([selBM]);
                break;
            case "bookmarktags:bmCmds:cutDelete":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.cutDelete([selBM]);
                break;
            case "bookmarktags:bmCmds:cutUntagAll":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.cutUntagAll([selBM]);
                break;
            case "bookmarktags:bmCmds:cutUntagTags":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.cutUntagTags(
                    [selBM], queryBuilder.query.tagIds());
                break;
            case "bookmarktags:bmCmds:delete":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.doDelete([selBM]);
                break;
            case "bookmarktags:bmCmds:open":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.open(selBM);
                break;
            case "bookmarktags:bmCmds:openInNewWindow":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.openInNewWindow(selBM);
                break;
            case "bookmarktags:bmCmds:openInNewTab":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.openInNewTab(selBM);
                break;
            case "bookmarktags:bmCmds:openInTabs":
                BookmarkTags.BookmarkCmds.openInTabs(queryBuilder.query.bmArr);
                break;
            case "bookmarktags:bmCmds:paste":
                let bms=
                    BookmarkTags.BookmarkCmds.paste(
                        queryBuilder.query.tagIds());
                selectBMsAfterPaste(bms);
                break;
            case "bookmarktags:bmCmds:properties":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.properties(selBM);
                break;
            case "bookmarktags:bmCmds:showInOrganizer":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.showInOrganizer(selBM.id);
                break;
            case "bookmarktags:bmCmds:untagAll":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.untagAll([selBM]);
                break;
            case "bookmarktags:bmCmds:untagTags":
                if (!selBM) return;
                BookmarkTags.BookmarkCmds.untagTags(
                    [selBM], queryBuilder.query.tagIds());
                break;
            default:
                let sort= BookmarkTags.BookmarkCmds.isSortCmd(cmd);
                if (sort)
                {
                    if (sort[0] === "sort")
                    {
                        queryBuilder.query.setBMSort(sort[1], null);
                    }
                    else queryBuilder.query.setBMSort(null, sort[1]);
                }
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            switch (cmd)
            {
            // selected bookmark
            case "bookmarktags:bmCmds:copy":
            case "bookmarktags:bmCmds:cutDelete":
            case "bookmarktags:bmCmds:cutUntagAll":
            case "bookmarktags:bmCmds:delete":
            case "bookmarktags:bmCmds:open":
            case "bookmarktags:bmCmds:openInNewWindow":
            case "bookmarktags:bmCmds:openInNewTab":
            case "bookmarktags:bmCmds:properties":
            case "bookmarktags:bmCmds:showInOrganizer":
            case "bookmarktags:bmCmds:untagAll":
                return !!bmTree.view.selectedObj;
                break;
            // simple nonempty query
            case "bookmarktags:bmCmds:cutUntagTags":
            case "bookmarktags:bmCmds:untagTags":
                return (queryBuilder.query.isSimple() &&
                        !queryBuilder.query.isEmpty() &&
                        !!bmTree.view.selectedObj);
                break;
            // nonempty bookmark tree
            case "bookmarktags:bmCmds:openInTabs":
                let bms= bmTree.view.allObjs;
                return bms && bms.length > 0;
                break;
            // paste
            case "bookmarktags:bmCmds:paste":
                return (!queryBuilder.query.isEmpty() &&
                        queryBuilder.query.isSimple() &&
                        BookmarkTags.BookmarkCmds.canPaste());
                break;
            // sort command, nonempty bookmark tree
            default:
                if (BookmarkTags.BookmarkCmds.isSortCmd(cmd))
                {
                    let bms= bmTree.view.allObjs;
                    return bms && bms.length > 0;
                }
                break;
            }
            return false;
        },
        supportsCommand: function (cmd)
        {
            switch (cmd)
            {
            case "bookmarktags:bmCmds:copy":
            case "bookmarktags:bmCmds:cutDelete":
            case "bookmarktags:bmCmds:cutUntagAll":
            case "bookmarktags:bmCmds:cutUntagTags":
            case "bookmarktags:bmCmds:delete":
            case "bookmarktags:bmCmds:open":
            case "bookmarktags:bmCmds:openInNewWindow":
            case "bookmarktags:bmCmds:openInNewTab":
            case "bookmarktags:bmCmds:openInTabs":
            case "bookmarktags:bmCmds:paste":
            case "bookmarktags:bmCmds:properties":
            case "bookmarktags:bmCmds:showInOrganizer":
            case "bookmarktags:bmCmds:untagAll":
            case "bookmarktags:bmCmds:untagTags":
                return !wasCmdFromTagMenu();
                break;
            }
            return (!!BookmarkTags.BookmarkCmds.isSortCmd(cmd) &&
                    !wasCmdFromTagMenu());
        },
        onEvent: function (evt) {}
    };

    const tagController=
    {
        doCommand: function (cmd)
        {
            var selTag;

            selTag= tagSelector.selectedTag;

            switch (cmd)
            {
            case "bookmarktags:tagCmds:copy":
                if (!selTag) return;
                BookmarkTags.TagCmds.copy(selTag.id, queryBuilder.query);
                break;
            case "bookmarktags:tagCmds:cut":
                if (!selTag) return;
                BookmarkTags.TagCmds.cut(selTag.id, queryBuilder.query);
                break;
            case "bookmarktags:tagCmds:delete":
                if (!selTag) return;
                BookmarkTags.TagCmds.doDelete([selTag.id]);
                break;
            case "bookmarktags:tagCmds:openInTabs":
                if (!selTag) return;
                BookmarkTags.TagCmds.openInTabs(selTag.id, queryBuilder.query);
                break;
            case "bookmarktags:tagCmds:paste":
                let tagIds= queryBuilder.query.tagIds();
                if (selTag) tagIds.push(selTag.id);
                let bms= BookmarkTags.BookmarkCmds.paste(tagIds);
                if (!selTag) selectBMsAfterPaste(bms);
                break;
            case "bookmarktags:tagCmds:properties":
                if (!selTag) return;
                BookmarkTags.TagCmds.properties(selTag.id);
                break;
            case "bookmarktags:tagCmds:select":
                if (!selTag) return;
                queryBuilder.query.intersectTag(selTag.id, selTag.title);
                break;
            case "bookmarktags:tagDisplayCmds:cloud":
                BookmarkTags.TagDisplayCmds.cloud();
                break;
            case "bookmarktags:tagDisplayCmds:customize":
                BookmarkTags.TagDisplayCmds.customize();
                break;
            case "bookmarktags:tagDisplayCmds:help":
                BookmarkTags.TagDisplayCmds.help();
                break;
            case "bookmarktags:tagDisplayCmds:list":
                BookmarkTags.TagDisplayCmds.list();
                break;
            default:
                let sort= BookmarkTags.TagDisplayCmds.isSortCmd(cmd);
                if (sort)
                {
                    if (sort[0] === "sort")
                    {
                        queryBuilder.query.setRelTagSort(sort[1], null);
                    }
                    else queryBuilder.query.setRelTagSort(null, sort[1]);
                }
                else
                {
                    let color= {};
                    if (selTag &&
                        BookmarkTags.TagCmds.isSetColorCmd(cmd, color))
                    {
                        BookmarkTags.TagCmds.setTagColor(
                            selTag.id, color.value, tagSelector.display);
                    }
                }
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            switch (cmd)
            {
            // selected tag
            case "bookmarktags:tagCmds:copy":
            case "bookmarktags:tagCmds:openInTabs":
            case "bookmarktags:tagCmds:properties":
            case "bookmarktags:tagCmds:select":
                return !!tagSelector.selectedTag;
                break;
            // empty query: we don't allow cutting or deleting unless query
            // is empty so as not to confuse people
            case "bookmarktags:tagCmds:cut":
            case "bookmarktags:tagCmds:delete":
                return (!!tagSelector.selectedTag &&
                        queryBuilder.query.isEmpty());
                break;
            // unconditional
            case "bookmarktags:tagDisplayCmds:cloud":
            case "bookmarktags:tagDisplayCmds:list":
            case "bookmarktags:tagDisplayCmds:customize":
            case "bookmarktags:tagDisplayCmds:help":
                return true;
                break;
            // paste:
            //   1. Query must be simple.
            //   2. We must have pasteable data.
            //   3. Either the query must be nonempty -- the same 3 criteria as
            //      the bookmark paste command -- or there must be a selected
            //      tag.  If there's a selected tag, we'll paste "into" the tag.
            case "bookmarktags:tagCmds:paste":
                return ((!queryBuilder.query.isEmpty() ||
                         !!tagSelector.selectedTag) &&
                        queryBuilder.query.isSimple() &&
                        BookmarkTags.BookmarkCmds.canPaste());
                break;
            default:
                // sort command, nonempty tag selector
                if (BookmarkTags.TagDisplayCmds.isSortCmd(cmd))
                {
                    let relTags= queryBuilder.query.relTagArr;
                    return relTags && relTags.length > 0;
                }
                // color command, selected tag
                else if (BookmarkTags.TagCmds.isSetColorCmd(cmd))
                {
                    return !!tagSelector.selectedTag;
                }
                break;
            }
            return false;
        },
        supportsCommand: function (cmd)
        {
            switch (cmd)
            {
            case "bookmarktags:tagCmds:copy":
            case "bookmarktags:tagCmds:cut":
            case "bookmarktags:tagCmds:delete":
            case "bookmarktags:tagCmds:openInTabs":
            case "bookmarktags:tagCmds:paste":
            case "bookmarktags:tagCmds:properties":
            case "bookmarktags:tagCmds:select":
            case "bookmarktags:tagDisplayCmds:cloud":
            case "bookmarktags:tagDisplayCmds:customize":
            case "bookmarktags:tagDisplayCmds:help":
            case "bookmarktags:tagDisplayCmds:list":
                return !wasCmdFromTagMenu();
                break;
            }
            return ((!!BookmarkTags.TagDisplayCmds.isSortCmd(cmd) ||
                     BookmarkTags.TagCmds.isSetColorCmd(cmd)) &&
                    !wasCmdFromTagMenu());
        },
        onEvent: function (evt) {}
    };

    // Lets the browser's global edit commands work with our widgets.
    const editController=
    {
        bmTable_:
        {
            cmd_copy:   "bookmarktags:bmCmds:copy",
            cmd_delete: "bookmarktags:bmCmds:delete",
            cmd_paste:  "bookmarktags:bmCmds:paste"
        },
        tagTable_:
        {
            cmd_copy:   "bookmarktags:tagCmds:copy",
            cmd_cut:    "bookmarktags:tagCmds:cut",
            cmd_delete: "bookmarktags:tagCmds:delete",
            cmd_paste:  "bookmarktags:tagCmds:paste"
        },
        doCommand: function (cmd)
        {
            switch (cmd)
            {
            case "cmd_copy":
            case "cmd_delete":
            case "cmd_paste":
                if (bmTree.hasFocus) bmController.doCommand(this.bmTable_[cmd]);
                else if (tagSelector.hasFocus)
                {
                    tagController.doCommand(this.tagTable_[cmd]);
                }
                break;
            case "cmd_cut":
                tagController.doCommand(this.tagTable_[cmd]);
                break;
            case "cmd_redo":
                BookmarkTags.Util.runBMBatch(function ()
                {
                     PlacesUtils.transactionManager.redoTransaction();
                });
                break;
            case "cmd_undo":
                BookmarkTags.Util.runBMBatch(function ()
                {
                    PlacesUtils.transactionManager.undoTransaction();
                });
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            switch (cmd)
            {
            case "cmd_copy":
            case "cmd_delete":
            case "cmd_paste":
                return ((bmTree.hasFocus &&
                         bmController.isCommandEnabled(this.bmTable_[cmd])) ||
                        (tagSelector.hasFocus &&
                         tagController.isCommandEnabled(this.tagTable_[cmd])));
                break;
            case "cmd_cut":
                return (tagSelector.hasFocus &&
                        tagController.isCommandEnabled(this.tagTable_[cmd]));
                break;
            case "cmd_redo":
                return PlacesUtils.transactionManager.numberOfRedoItems > 0;
                break;
            case "cmd_undo":
                return PlacesUtils.transactionManager.numberOfUndoItems > 0;
                break;
            }
            return false;
        },
        supportsCommand: function (cmd)
        {
            switch (cmd)
            {
            case "cmd_copy":
            case "cmd_cut":
            case "cmd_delete":
            case "cmd_paste":
            case "cmd_redo":
            case "cmd_undo":
                return true;
                break;
            }
            return false;
        },
        onEvent: function (evt) {}
    };

    // Toggles query cloud hidden state.
    const prefsObserver=
    {
        observe: function (subject, topic, data)
        {
            queryCloud.hidden= BookmarkTags.Util.prefs.getBoolPref(data);
        }
    };

    // Handles drags originating in the bookmark tree.  Uses
    // chrome://global/content/nsDragAndDrop.js, which wraps drag and drop
    // functionality and in particular implements the dragging UI feedback.  I
    // could've used this to handle drops on the tree too but didn't see any
    // benefit to not just handling it myself directly.
    const dndObserver=
    {
        onDragStart: function (event, transferData, dragAction)
        {
            var bmObjs;

            bmObjs= bmTree.view.selectedObjs;
            if (bmObjs && bmObjs.length > 0)
            {
                BookmarkTags.BookmarkCmds.handleDragGesture(
                    bmObjs, event, transferData, dragAction);
            }
        }
    };

    const queryObserver=
    {
        onQueryRelTagChanged: function (query)
        {
            if (query.relTagArr.length > 0)
            {
                splitter.setAttribute("state", "open");
            }
            else splitter.setAttribute("state", "collapsed");

            // Since the enabled status of tag and bookmark commands may
            // change depending on the query, we need to force the browser's
            // edit menu commands to update.  try'ing because, well, to be safe.
            // I'm not expecting any errors to be thrown.
            try
            {
                window.parent.goUpdateGlobalEditMenuItems();
            }
            catch (exc) {}
        }
    };

    function bmSearch(searchStr)
    {
        queryBuilder.query.bmSearch(searchStr);
    }

    // see content/browser/bookmarks/sidebarUtils.js
    function clearStatusBar()
    {
        try
        {
            if (window.top.XULBrowserWindow)
            {
                window.top.XULBrowserWindow.setOverLink("", null);
            }
        }
        catch (e) {}
    }

    function getQueryBuilder()
    {
        return queryBuilder;
    }

    // see content/browser/bookmarks/sidebarUtils.js
    function onBMTreeClick(tree, event)
    {
        if (event.button !== 2 &&
            event.originalTarget.localName === "treechildren")
        {
            let row= {};
            tree.treeBoxObject.getCellAt(event.clientX, event.clientY, row,
                                         {}, {});
            if (row.value >= 0)
            {
                BookmarkTags.BookmarkCmds.
                    openWithEvent(tree.view.getObjAtRow(row.value), event);
            }
        }
    }

    // Handles drops on the bookmark tree.
    function onBMTreeDragDrop()
    {
        BookmarkTags.BookmarkCmds.handleDragDrop(queryBuilder.query.tagIds());
    }

    // Handles drags from the bookmark tree.  nsDragAndDrop.startDrag calls
    // onDragStart of dndObserver above.  The draggesture handler of the
    // Places tree at firefox/source/browser/components/places/content/tree.xml
    // has the treechildren check, so I do too.
    function onBMTreeDragGesture(event)
    {
        if (event.target.localName === "treechildren")
        {
            nsDragAndDrop.startDrag(event, dndObserver);
        }
    }

    // Handles drags over the bookmark tree.  Returns true if the dragged items
    // can be dropped on it.
    function onBMTreeDragOver()
    {
        if (!queryBuilder.query.isSimple() || queryBuilder.query.isEmpty())
        {
            return false;
        }
        return BookmarkTags.BookmarkCmds.handleDragOver();
    }

    // see content/browser/bookmarks/sidebarUtils.js
    function onBMTreeKeypress(tree, event)
    {
        if (event.keyCode === event.DOM_VK_RETURN)
        {
            BookmarkTags.BookmarkCmds.openWithEvent(tree.view.selectedObj,
                                                    event);
        }
    }

    // Sets statusbar text to URL of hovered-over bookmark.
    // See content/browser/bookmarks/sidebarUtils.js
    function onBMTreeMouseMove(tree, event)
    {
        if (event.originalTarget.localName === "treechildren")
        {
            let row= {};
            tree.treeBoxObject.getCellAt(event.clientX, event.clientY, row,
                                         {}, {});
            if (row.value >= 0 && window.top.XULBrowserWindow)
            {
                try
                {
                    window.top.XULBrowserWindow.
                        setOverLink(tree.view.getObjAtRow(row.value).url, null);
                }
                catch (e) {}
            }
            else clearStatusBar();
        }
    }

    function onload()
    {
        bmTree= document.getElementById("bmtree");
        queryCloud= document.getElementById("queryCloud");
        tagSelector= document.getElementById("selector");
        splitter= document.getElementById("tagBrowserSidebarSplitter");

        queryBuilder=
            BookmarkTags.QueryBuilder.
            make(document.getElementById("tagInput"), queryCloud, tagSelector);
        queryBuilder.query.addRelTagObserver(queryObserver);

        bmTree.query= queryBuilder.query;

        BookmarkTags.Util.prefs.
            QueryInterface(Components.interfaces.nsIPrefBranch2).
            addObserver("hideQueryCloud", prefsObserver, false);

        window.controllers.appendController(bmController);
        window.controllers.appendController(tagController);

        // All windows have a controller at index 0 that handles some edit
        // commands depending on the content of the window.  Bump it.
        window.controllers.insertControllerAt(0, editController);

        window.addEventListener("SidebarFocused", onSidebarFocused, false);

        // If we're on a Mac using the default skin, load the stylesheet that
        // makes the tag input nice and rounded.
        if (BookmarkTags.Util.getOS() === "Darwin" &&
            Components.classes["@mozilla.org/preferences-service;1"].
                getService(Components.interfaces.nsIPrefService).
                getBranch("general.skins.").
                getCharPref("selectedSkin") === "classic/1.0")
        {
            macCSSLoaded= true;
            BookmarkTags.Util.loadStylesheet(
            "chrome://bookmarktags-platform/skin/tagBrowserSidebarClassic.css");
        }
    }

    // Called when tag selector display dropdown is selected.
    function onSelectorToggle(event)
    {
        var val;

        val= event.target.value;
        if (val) BookmarkTags.TagDisplayCmds[val]();
    }

    function onSidebarFocused()
    {
        document.getElementById("tagInput").inner.focus();
    }

    function onTagSelect(event)
    {
        if (BookmarkTags.BookmarkCmds.shouldClickOpenInTabs(event))
        {
            BookmarkTags.TagCmds.openInTabs(event.selectedTagId,
                                            queryBuilder.query,
                                            event);
        }
        else queryBuilder.onTagSelect(event);
    }

    function onunload()
    {
        setSortPrefs();

        queryBuilder.query.removeRelTagObserver(queryObserver);
        queryBuilder.cleanup();

        BookmarkTags.Util.prefs.
            QueryInterface(Components.interfaces.nsIPrefBranch2).
            removeObserver("hideQueryCloud", prefsObserver, false);

        window.controllers.removeController(bmController);
        window.controllers.removeController(tagController);
        window.controllers.removeController(editController);

        window.removeEventListener("SidebarFocused", onSidebarFocused, false);

        if (macCSSLoaded)
        {
            BookmarkTags.Util.unloadStylesheet(
            "chrome://bookmarktags-platform/skin/tagBrowserSidebarClassic.css");
        }
    }

    function prepareBMContextMenu(popup)
    {
        document.popupNode= null; // see wasCmdFromTagMenu

        bmTree.view.ensureSelectedObjExists();
        BookmarkTags.BookmarkCmds.update();
    }

    function prepareBMSortMenu(popup)
    {
        document.popupNode= null; // see wasCmdFromTagMenu

        window.focus();
        BookmarkTags.Util.prepareSortMenu(popup,
                                          queryBuilder.query.bmSort,
                                          queryBuilder.query.bmSortDir);
    }

    function prepareTagSelectorContextMenu(popup)
    {
        var type;

        document.popupNode= null; // see wasCmdFromTagMenu

        window.focus();
        tagSelector.ensureSelectedTagExists();

        BookmarkTags.TagCmds.update();
        BookmarkTags.TagDisplayCmds.update();

        type= tagSelector.displayType;
        for (let i= 0; i < popup.childNodes.length; i++)
        {
            let item= popup.childNodes.item(i);
            switch (item.getAttribute("command"))
            {
            case "bookmarktags:tagDisplayCmds:cloud":
                if (type !== "cloud") item.removeAttribute("checked");
                else item.setAttribute("checked", "true");
                break;
            case "bookmarktags:tagDisplayCmds:list":
                if (type !== "list") item.removeAttribute("checked");
                else item.setAttribute("checked", "true");
                break;
            }
        }
    }

    function prepareTagSortMenu(popup)
    {
        BookmarkTags.Util.prepareSortMenu(popup,
                                          queryBuilder.query.relTagSort,
                                          queryBuilder.query.relTagSortDir);
    }

    function selectBMsAfterPaste(bms)
    {
        if (bms && bms.length > 0)
        {
            // Select the first pasted bookmark in the tree.  More than
            // one bookmark may have been pasted, but the tree is
            // single-selection.
            setTimeout(function ()
            {
                let bm= bms[0];
                if (bm.id) bms= [bm];
                else
                {
                    // Get all IDs for the URI.  One of them will be
                    // the ID in the tree (the ID of the bookmark copy
                    // in the folder hierarchy, not in a tags folder),
                    // and the view will ignore the rest.
                    bms=
                        BookmarkTags.Util.bmServ.
                            getBookmarkIdsForURI(bm.uri, {}, {}).
                            map(function (bid) { return { id: bid }; });
                }
                bmTree.view.selectedObjs= bms;
            }, 0);
        }
    }

    // Writes the tag and bookmark sort preferences.  (Tree column states are
    // stored as prefs by the tree views.)
    function setSortPrefs()
    {
        [["bookmarkSort", queryBuilder.query.bmSort],
         ["bookmarkSortDirection", queryBuilder.query.bmSortDir],
         ["tagSort", queryBuilder.query.relTagSort],
         ["tagSortDirection", queryBuilder.query.relTagSortDir]].
        forEach(function (a) BookmarkTags.Util.prefs.setCharPref(a[0], a[1]));
    }

    // Opening the tag menu leaves the tag selector and bookmarks tree focused
    // (if they were focused to begin with).  That's a problem because
    // goUpdateCommand finds their controllers instead of the tag menu's.  So
    // the controllers above use this to determine when they ought to pass the
    // buck.
    function wasCmdFromTagMenu()
    {
        var elt;

        // Commands can only be fired from the tag menu via the context menu
        // => document.popupNode exists.  onpopupshowing for the corresponding
        // popups here in the sidebar, we manually set popupNode to null.
        elt= document.popupNode;
        if (!elt) return false;
        return ((elt.hasAttribute("bmt-bmid") &&
                 elt.localName === "menuitem") ||
                (elt.hasAttribute("bmt-tagid") &&
                 elt.localName === "menu"));
    }

    return {
        bmSearch:                      bmSearch,
        clearStatusBar:                clearStatusBar,
        getQueryBuilder:               getQueryBuilder,
        onBMTreeClick:                 onBMTreeClick,
        onBMTreeDragDrop:              onBMTreeDragDrop,
        onBMTreeDragOver:              onBMTreeDragOver,
        onBMTreeDragGesture:           onBMTreeDragGesture,
        onBMTreeKeypress:              onBMTreeKeypress,
        onBMTreeMouseMove:             onBMTreeMouseMove,
        onload:                        onload,
        onSelectorToggle:              onSelectorToggle,
        onTagSelect:                   onTagSelect,
        onunload:                      onunload,
        prepareBMContextMenu:          prepareBMContextMenu,
        prepareBMSortMenu:             prepareBMSortMenu,
        prepareTagSelectorContextMenu: prepareTagSelectorContextMenu,
        prepareTagSortMenu:            prepareTagSortMenu
    };
}();
