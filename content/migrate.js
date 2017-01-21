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

const BookmarkTags= function ()
{
    const CC= Components.classes;
    const CI= Components.interfaces;
    const Ci= Components.interfaces;
    const bmServ=
        CC["@mozilla.org/browser/nav-bookmarks-service;1"].
        getService(CI.nsINavBookmarksService);
    const histServ=
        CC["@mozilla.org/browser/nav-history-service;1"].
        getService(CI.nsINavHistoryService);
    const lmServ=
        CC["@mozilla.org/browser/livemark-service;2"].
        getService(CI.nsILivemarkService);
    const strings=
        Components.classes["@mozilla.org/intl/stringbundle;1"].
        getService(Components.interfaces.nsIStringBundleService).
        createBundle("chrome://bookmarktags/locale/migrate.properties");
    const tagServ=
        CC["@mozilla.org/browser/tagging-service;1"].
        getService(CI.nsITaggingService);
    const threadMan=
        CC["@mozilla.org/thread-manager;1"].
        getService(CI.nsIThreadManager);
    const winMan=
        CC["@mozilla.org/appshell/window-mediator;1"].
        getService(CI.nsIWindowMediator);

    var rootFolderId;
    var includeRoot;
    var canceled= false;

    function onCancel()
    {
        canceled= true;
        return true;
    }

    const IntroPage= function ()
    {
        var libraryWarned= false;

        function onAdvanced()
        {
            if (winMan.getMostRecentWindow("Places:Organizer") && !libraryWarned)
            {
                libraryWarned= true;
                alert(strings.GetStringFromName("libraryWarning"));
                return false;
            }
            return true;
        }

        return {
            onAdvanced: onAdvanced
        };
    }();

    const RootFolderPage= function ()
    {
        var tree;

        function onAdvanced()
        {
            if (!tree.selectedNode) return false;
            selectRootFolder();
            includeRoot=
                document.getElementById("rootFolderPage-includeRoot").checked;
            return true;
        }

        function onRewound()
        {
            document.documentElement.canAdvance= true;
            return true;
        }

        function onShow()
        {
            var query;
            var opts;
            var result;
            var treeViewer;

            tree= document.getElementById("rootFolderPage-bmTree");
            query= histServ.getNewQuery();
            query.setFolders([PlacesUIUtils.allBookmarksFolderId], 1);
            opts= histServ.getNewQueryOptions();
            //opts.setGroupingMode([opts.GROUP_BY_FOLDER], 1);
            opts.excludeItems= true;
            opts.excludeQueries= true;
            opts.excludeReadOnlyFolders= true;
            result= histServ.executeQuery(query, opts);
            treeViewer= new PlacesTreeView(false);
            Ci = Components.interfaces; //possible bug in treeView.js (to investigate)
            result.addObserver(treeViewer.QueryInterface(CI.nsINavHistoryResultObserver), true);
            tree.view= treeViewer.QueryInterface(CI.nsITreeView);
            if (rootFolderId) tree.selectItems([rootFolderId]);
            document.documentElement.canAdvance= !!tree.selectedNode;
        }

        function selectRootFolder()
        {
            if (tree.selectedNode)
            {
                rootFolderId= PlacesUtils.getConcreteItemId(tree.selectedNode);
                document.documentElement.canAdvance= true;
            }
        }

        return {
            onAdvanced:       onAdvanced,
            onRewound:        onRewound,
            onShow:           onShow,
            selectRootFolder: selectRootFolder
        };
    }();

    var ConversionPage= function ()
    {
        var p1ProgMeter;
        var p2ProgMeter;

        function computeBMTags(rootFolderId, includeRoot)
        {
            var folderNameStack;
            var traversalStack;
            var arr;

            // We'll do the traversal iteratively by keeping a stack.
            arr= [];
            folderNameStack= [];
            traversalStack= [null, rootFolderId];
            while (traversalStack.length > 0)
            {
                let folderId= traversalStack.pop();
                if (folderId === null)
                {
                    folderNameStack.pop();
                    continue;
                }

                let folder= getFolder(folderId);
                if (folderId != rootFolderId || includeRoot)
                {
                    folderNameStack.push(folder.title);
                }

                folder.containerOpen= true;
                for (let i= 0; i < folder.childCount; i++)
                {
                    let child= folder.getChild(i);
                    switch (child.type)
                    {
                    case CI.nsINavHistoryResultNode.RESULT_TYPE_FOLDER:
                        if (!lmServ.isLivemark(child.itemId))
                        {
                            traversalStack.push(null, child.itemId);
                        }
                        else
                        {
                            arr.push({
                                uri:   lmServ.getFeedURI(child.itemId),
                                title: new String(child.title),
                                tags:  folderNameStack.slice(0)
                            });
                        }
                        break;
                    case CI.nsINavHistoryResultNode.RESULT_TYPE_URI:
                        arr.push({
                            uri:   bmServ.getBookmarkURI(child.itemId),
                            title: new String(child.title),
                            tags:  folderNameStack.slice(0)
                        });
                        break;
                    }
                    threadMan.mainThread.QueryInterface(CI.nsIEventTarget).
                        processNextEvent(false);
                }
                folder.containerOpen= false;
            }

            return arr;
        }

        function convert(bmSet)
        {
            var batch;

            histServ.QueryInterface(CI.nsIGlobalHistory2);
            batch=
            {
                runBatched: function (userData)
                {
                    for (let i= 0; i < bmSet.length && !canceled; i++)
                    {
                        let bm= bmSet[i];
                        p2ProgMeter.value=
                            Math.floor(((i + 1) / bmSet.length) * 100);
                        tagServ.tagURI(bm.uri, bm.tags);
                        threadMan.mainThread.QueryInterface(CI.nsIEventTarget).
                            processNextEvent(false);
                        histServ.setPageTitle(bm.uri, bm.title);
                        threadMan.mainThread.QueryInterface(CI.nsIEventTarget).
                            processNextEvent(false);
                    }
                }
            };
            bmServ.runInBatchMode(batch, null);
        }

        function getFolder(folderId)
        {
            var query;

            query= histServ.getNewQuery();
            query.setFolders([folderId], 1);
            return histServ.executeQuery(query,
                                         histServ.getNewQueryOptions()).root;
        }

        function onRewound()
        {
            document.documentElement.getButton("cancel").disabled= false;
            return true;
        }

        function onShow()
        {
            var bmSet;
            var finishBtn;
            var cancelBtn;
            var workingBox;
            var completeNotif;

            p1ProgMeter= document.getElementById("conversionPage-p1ProgMeter");
            p2ProgMeter= document.getElementById("conversionPage-p2ProgMeter");
            workingBox= document.getElementById("conversionPage-workingBox");
            completeNotif=
                document.getElementById("conversionPage-completeNotif");
            finishBtn= document.documentElement.getButton("finish");
            cancelBtn= document.documentElement.getButton("cancel");

            document.documentElement.canRewind= false;
            document.documentElement.canAdvance= false;
            finishBtn.disabled= true;
            cancelBtn.disabled= false;
            completeNotif.collapsed= true;
            p2ProgMeter.collapsed= true;
            p1ProgMeter.collapsed= false;
            workingBox.collapsed= false;

            // First pass
            bmSet= computeBMTags(rootFolderId, includeRoot);

            // Second pass
            p1ProgMeter.collapsed= true;
            p2ProgMeter.collapsed= false;
            convert(bmSet);

            workingBox.collapsed= true;
            completeNotif.collapsed= false;
            document.documentElement.canRewind= true;
            document.documentElement.canAdvance= true;
            finishBtn.disabled= false;
            cancelBtn.disabled= true;
        }

        return {
            onRewound: onRewound,
            onShow:    onShow
        };
    }();

    return {
        IntroPage:      IntroPage,
        ConversionPage: ConversionPage,
        RootFolderPage: RootFolderPage,
        onCancel:       onCancel
    };
}();
