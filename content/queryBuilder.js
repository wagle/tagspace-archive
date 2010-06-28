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

BookmarkTags.QueryBuilder= function ()
{
    // in the following, see fixTagName for note about "fixed"
    var tagNameList; // array of all fixed tag names; kept for 1. tag input
                     // completions via relTagsNames and 2. bookmark scrolling
                     // on tag input command
    var tagIdHash;   // tag ID => fixed lowercase tag name
    var tagNameHash; // fixed lowercase tag name => [ { id, title } ]; array
                     // needed because two tags (different IDs) may have same
                     // name

    var builders;
    var disableFindAsYouType;
    var queryDisplayTagClickAction;
    var restrictQueryInputCompletions;

    // Preferences observer.  We cache prefs as an optimization.  Also needed to
    // update context menus.
    const prefsObserver=
    {
        observe: function (subject, topic, data)
        {
            subject.QueryInterface(Components.interfaces.nsIPrefBranch2);
            switch (data)
            {
            case "disableFindAsYouType":
                disableFindAsYouType=
                    subject.getBoolPref("disableFindAsYouType");
                updateQueryInputContextMenus();
                break;
            case "queryCloudTagClickAction":
                queryDisplayTagClickAction=
                    subject.getIntPref("queryCloudTagClickAction");
                break;
            case "restrictQueryInputCompletions":
                restrictQueryInputCompletions=
                    subject.getBoolPref("restrictQueryInputCompletions");
                updateQueryInputCompletions();
                break;
            }
        }
    };

    // One global query input controller per window -- all builders share it.
    const queryInputController=
    {
        doCommand: function (cmd)
        {
            BookmarkTags.QueryCmds.doCommand(cmd);
        },
        isCommandEnabled: function (cmd)
        {
            return true;
        },
        supportsCommand: function (cmd)
        {
            return (cmd === "bookmarktags:queryCmds:toggleFindAsYouType");
        },
        onEvent: function (evt) {}
    };

    // Used to keep up to date the tag names list and hash, which are in turn
    // used to keep tag input completions up to date.
    const tagObserver=
    {
        onItemAdded: function (itemId, folderId, index, itemType)
        {
            if (folderId === BookmarkTags.Util.bmServ.tagsFolder)
            {
                registerTag(itemId);
            }
        },
        onItemRemoved: function (itemId, folderId, index, itemType)
        {
            if (folderId === BookmarkTags.Util.bmServ.tagsFolder)
            {
                unregisterTag(itemId);
            }
        },
        onItemChanged: function (itemId, property, isAnnoProperty, value, lastModified, itemType)
        {
            if (property === "title" && BookmarkTags.Util.isTag(itemId))
            {
                unregisterTag(itemId);
                registerTag(itemId, value);
            }
        },
        onBeforeItemRemoved: function (itemId, itemType) {},
        onBeginUpdateBatch: function () {},
        onEndUpdateBatch: function () {},
        onItemVisited: function (bookmarkId, visitID, time) {},
        onItemMoved: function (itemId, oldParentId, oldIndex, newParentId,
                               newIndex, itemType) {}
    };

    // Called when the last builder in the window is cleaned up.
    function cleanup()
    {
        builders= null;
        window.controllers.removeController(queryInputController);
        BookmarkTags.Util.bmServ.removeObserver(tagObserver);
        BookmarkTags.Util.prefs.
            QueryInterface(Components.interfaces.nsIPrefBranch2).
            removeObserver("", prefsObserver, false);
    }

    // A tag name can contain unprintable characters like \n.  That makes it
    // impossible to type it into the tag input.  If we don't compensate, we've
    // got our tags with unprintable characters in tagNameList and relTagsNames,
    // but the user can't ever get to them via the input.  This function helps
    // fix that problem.  We compensate the same way the UI (the tree and
    // labels in the cloud) automatically does -- by collapsing unprintables.
    //
    // But there's still the problem that scrollTagTree may not scroll to the
    // right row.  I don't see a way around that.  "bad\ntag" is entered in the
    // input as "badtag", but "badtag" does not map to "bad\ntag" in the
    // ordering: "badtag" < "bad tag", but "bad\ntag" > "bad tag".
    function fixTagName(tagName)
    {
        return tagName.replace(/[\r\n\t]/g, "");
    }

    function hashGet(hashObj, hashCode)
    {
        if (hashObj.hasOwnProperty(hashCode)) return hashObj[hashCode];
        return undefined;
    }

    // Called when the first builder in the window is made.
    function init()
    {
        builders= [];

        disableFindAsYouType=
            BookmarkTags.Util.prefs.getBoolPref("disableFindAsYouType");
        queryDisplayTagClickAction=
            BookmarkTags.Util.prefs.getIntPref("queryCloudTagClickAction");
        restrictQueryInputCompletions=
            BookmarkTags.Util.prefs.
            getBoolPref("restrictQueryInputCompletions");

        tagNameList= [];
        tagNameList.comparator= tagNameComp;
        tagIdHash= {};
        tagNameHash= makeTagNameHash();
        BookmarkTags.Util.forEachTag(function (to)
        {
            registerTag(to.itemId, to.title);
        });

        window.controllers.appendController(queryInputController);
        BookmarkTags.Util.bmServ.addObserver(tagObserver, false);
        BookmarkTags.Util.prefs.
            QueryInterface(Components.interfaces.nsIPrefBranch2).
            addObserver("", prefsObserver, false);
    }

    // Convenience to make a new Builder.
    function make(tagInput, queryDisplay, tagSelector)
    {
        return new Builder(tagInput, queryDisplay, tagSelector);
    }

    function makeTagNameHash()
    {
        var hash;

        hash= {};
        hash.addTag= function (lowerName, tagId, tagName)
        {
            var arr;
            var tagObj;
            arr= hashGet(this, lowerName);
            tagObj= { id: tagId, title: tagName };
            if (arr) arr.push(tagObj);
            else this[lowerName]= [tagObj];
        };
        hash.removeTag= function (lowerName, tagId)
        {
            var arr;
            arr= hashGet(this, lowerName);
            arr= arr.filter(function (to) to.id !== tagId);
            if (arr.empty()) delete this[lowerName];
            else this[lowerName]= arr;
        };
        return hash;
    }

    // New builders call this to register themselves.
    function registerBuilder(builder)
    {
        if (!builders) init();
        builders.push(builder);
    }

    // Used to maintain the structures that keep track of all tags.
    function registerTag(tagId, tagName)
    {
        var fixed;
        var fixedLower;

        if (!tagName) tagName= BookmarkTags.Util.getFolderTitle(tagId);
        fixed= fixTagName(tagName);
        tagNameList.bininsert(fixed);
        fixedLower= fixed.toLocaleLowerCase();
        tagNameHash.addTag(fixedLower, tagId, tagName);
        tagIdHash[tagId]= fixedLower;
    }

    function tagNameComp(t1, t2)
    {
        return t1.toLocaleLowerCase().compare(t2.toLocaleLowerCase());
    }

    // Builders call this as they're cleaned up.
    function unregisterBuilder(builder)
    {
        var idx;

        idx= builders.indexOf(builder);
        delete builders[idx];
        builders.splice(idx, 1);
        if (builders.empty()) cleanup();
    }

    // Used to maintain the structures that keep track of all tags.
    function unregisterTag(tagId)
    {
        var fixedLower;

        fixedLower= hashGet(tagIdHash, tagId);
        tagNameList.binremove(fixedLower);
        tagNameHash.removeTag(fixedLower, tagId);
        delete tagIdHash[tagId];
    }

    function updateQueryInputContextMenus()
    {
        builders.forEach(function (b) b.updateQueryInputContextMenu());
    }

    function updateQueryInputCompletions()
    {
        builders.forEach(function (b) b.updateQueryInputCompletions());
    }

    // Each builder gets its own controller to handle query commands.
    function QueryController(builder)
    {
        this.builder= builder;
    }

    QueryController.prototype=
    {
        doCommand: function (cmd)
        {
            switch (cmd)
            {
            case "bookmarktags:queryCmds:removeSucceedingTags":
                this.builder.removeSucceedingTags(this.builder.queryDisplay.
                                                  selectedTag.id);
                break;
            case "bookmarktags:queryCmds:removeTag":
                this.builder.removeTag(
                    this.builder.queryDisplay.selectedTag.id);
                break;
            case "bookmarktags:queryCmds:removeOtherTags":
                this.builder.removeOtherTags(this.builder.queryDisplay.
                                             selectedTag.id);
                break;
            case "bookmarktags:queryCmds:removeAllTags":
                this.builder.resetQuery();
                break;
            default:
                BookmarkTags.QueryCmds.doCommand(cmd);
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            var selTag;
            var lastTag;

            selTag= this.builder.queryDisplay.selectedTag;
            if (!selTag) return false;

            switch (cmd)
            {
            case "bookmarktags:queryCmds:removeSucceedingTags":
                lastTag= this.builder.query.tags().last();
                return lastTag && lastTag.id !== selTag.id;
                break;
            case "bookmarktags:queryCmds:removeTag":
                return true;
                break;
            case "bookmarktags:queryCmds:removeOtherTags":
                return this.builder.query.tags().length > 1;
                break;
            case "bookmarktags:queryCmds:removeAllTags":
                return !this.builder.query.tags().empty();
                break;
            default:
                return true;
                break;
            }
        },
        supportsCommand: function (cmd)
        {
            return BookmarkTags.QueryCmds.supportsCommand(cmd);
        },
        onEvent: function (evt) {}
    };

    // Other widgets and scripts in the window interact with a tag query
    // through a Builder object.  If a window needs to keep track of more than
    // one query, it makes as many Builders as it needs, one per query.  Any of
    // the arguments may be unspecified.
    function Builder(tagInput, queryDisplay, tagSelector)
    {
        registerBuilder(this);

        this.tagInput= tagInput;
        this.queryDisplay= queryDisplay;
        this.tagSelector= tagSelector;

        this.relTagsNames= tagNameList;
        this.updateQueryInputCompletions();
        this.updateQueryInputContextMenu();

        this.query= BookmarkTags.Query.emptyQuery(true);
        this.query.addRelTagObserver(this);
        this.query.addTagObserver(this);

        if (queryDisplay)
        {
            queryDisplay.query= this.query;
            this.queryController= new QueryController(this);
            queryDisplay.controllers.appendController(this.queryController);
        }
        if (tagSelector) tagSelector.query= this.query;
    }

    Builder.prototype.
    cleanup= function ()
    {
        unregisterBuilder(this);
        if (this.queryDisplay)
        {
            this.queryDisplay.controllers.
                removeController(this.queryController);
        }
        this.query.removeRelTagObserver(this);
        this.query.removeTagObserver(this);
        this.query.cleanup();
        this.query= null;
    };

    // Query observer callback.  Updates relTagsNames and tag input completions.
    Builder.prototype.
    onQueryRelTagChanged= function (query)
    {
        if (this.query.isEmpty()) this.relTagsNames= tagNameList;
        else
        {
            this.relTagsNames= [];
            this.relTagsNames.comparator= tagNameComp;
            for (let i= 0; i < this.query.relTagArr.length; i++)
            {
                let tagName= this.query.relTagArr[i].title;
                this.relTagsNames.bininsert(fixTagName(tagName));
            }
        }

        if (this.tagInput) this.updateQueryInputCompletions();
    };

    // The Builder's queryDisplay should use this method as an ontagselect
    // callback.
    Builder.prototype.
    onQuerySelect= function (event)
    {
        switch (queryDisplayTagClickAction)
        {
        default:
            BookmarkTags.Util.prefs.clearUserPref("queryCloudTagClickAction");
            // fall through to default
        case BookmarkTags.QueryCmds.QUERY_CLICK_SUCC:
            this.removeSucceedingTags(event.selectedTagId);
            break;
        case BookmarkTags.QueryCmds.QUERY_CLICK_TAG:
            this.removeTag(event.selectedTagId);
            break;
        case BookmarkTags.QueryCmds.QUERY_CLICK_OTHERS:
            this.removeOtherTags(event.selectedTagId);
            break;
        }
    };

    // Query observer callback.  Updates the tag input's query.
    Builder.prototype.
    onQueryTagChanged= function (query)
    {
        // Set tag input's query.
        if (this.tagInput)
        {
            let maybeTagInput= null;
            try
            {
                if (document.commandDispatcher.focusedElement)
                {
                    // The tag input's textbox's HTML input is actually the element
                    // that's focused.  Try to get our tag input.
                    maybeTagInput=
                        document.commandDispatcher.focusedElement.parentNode.
                        parentNode.parentNode;
                }
            }
            catch (exc) {}

            // If query was not changed from tag input (i.e., tag input is not
            // focused), set tag input's text.
            if (maybeTagInput !== this.tagInput)
            {
                this.tagInput.setQuery(this.query);
            }
        }
    };

    // The Builder's tagInput should use this method as an oncommand callback.
    Builder.prototype.
    onTagInputCommand= function (tagInput, event)
    {
        var query;
        var lastTagName;

        query= this.tagInput.parse();

        if (this.tagSelector && this.tagSelector.displayType === "list")
        {
            let lastTag= query.tags().last();
            if (lastTag) this.scrollTagTree(lastTag.title);
        }

        // Try new query.
        if (this.tagInput.actionKeyPressed ||
            (!disableFindAsYouType && !this.tagInput.tagCompleted))
        {
            let newQTagIds= [];
            query.select(function (tagTok)
            {
                var arr;
                var tagObj;

                // tagNameHash keys are fixedLowers.  tagTok comes from query,
                // which comes from tag input => tagTok.title is fixed.
                arr= hashGet(tagNameHash, tagTok.title.toLocaleLowerCase());
                if (!arr) return false;
                if (arr.length === 1) tagObj= arr[0]; // optimize common case
                else
                {
                    // query potentially contains multiple tags with same name;
                    // find first tag (by ID) in arr that hasn't been used yet,
                    // i.e., that's not in newQTagIds
                    for (let i= 0; !tagObj && i < arr.length; i++)
                    {
                        if (newQTagIds.indexOf(arr[i].id) < 0) tagObj= arr[i];
                    }
                    if (!tagObj) tagObj= arr[0];
                }
                newQTagIds.push(tagObj.id);

                // tagTok comes from query, which comes from the tag input,
                // which means that tagTok has no ID.
                tagTok.id= tagObj.id;

                return true;
            });

            this.query.setTo(query);
        }
    };

    // The Builder's tagSelector should use this method as an ontagselect
    // callback.
    Builder.prototype.
    onTagSelect= function (event)
    {
        this.query.intersectTag(event.selectedTagId,
                                fixTagName(event.selectedTagTitle));
    };

    Builder.prototype.
    removeSucceedingTags= function (tagId)
    {
        this.query.removeSucceedingTags(tagId);
    };

    Builder.prototype.
    removeOtherTags= function (tagId)
    {
        this.query.removeOtherTags(tagId);
    };

    Builder.prototype.
    removeTag= function (tagId)
    {
        this.query.removeTag(tagId);
    };

    Builder.prototype.
    resetQuery= function ()
    {
        this.query.clear();
    };

    // Used to scroll the tag tree as the user types in the tag input.
    // searchStr need not be a valid tag name.
    Builder.prototype.
    scrollTagTree= function (searchStr)
    {
        var fixedLower;
        var searchTagArr;
        var qTags;
        var lastTagId;
        var index;

        // searchStr came from tag input => searchStr has been fixed
        fixedLower= searchStr.toLocaleLowerCase();
        searchTagArr= hashGet(tagNameHash, fixedLower);
        qTags= this.query.tags();
        lastTagId= (qTags.empty() ? null : qTags.last().id);

        // After a full tag name is entered the tree is updated to reflect the
        // new query.  We don't want to scroll this new tree to the last-typed
        // tag before the user begins typing a new tag.  So, continue if:
        // 1) searchStr is not a tag name, or
        // 2) this.query has no tags, or
        // 3) this.query's last tag is not searchStr
        if (!searchTagArr ||
            qTags.empty() ||
            !searchTagArr.some(function (to) to.id === lastTagId))
        {
            let search= this.relTagsNames.binsearch(fixedLower);

            if (this.query.relTagSort === "title" &&
                this.query.relTagSortDir === "ASC")
            {
                index= search.index;
            }
            else if (this.query.relTagSort === "title" &&
                     this.query.relTagSortDir === "DESC")
            {
                index= this.relTagsNames.length - search.index - 1;
            }
            else index= -1;

            // Funny things happen to the tree if we scroll when all rows are
            // visible to begin with.
            if (index >= 0 &&
                index < this.tagSelector.display.view.rowCount &&
                this.tagSelector.display.treeBoxObject.getLastVisibleRow() -
                this.tagSelector.display.treeBoxObject.getFirstVisibleRow() <
                this.tagSelector.display.view.rowCount - 1)
            {
                this.tagSelector.display.treeBoxObject.scrollToRow(index);
            }
        }
    };

    Builder.prototype.
    updateQueryInputContextMenu= function ()
    {
        var id;

        if (!this.tagInput) return;

        id= (this.tagInput.getAttribute("context") ||
             this.tagInput.getAttribute("contextmenu"));
        if (id)
        {
            let elts=
                document.getElementById(id).
                getElementsByAttribute("command",
                                  "bookmarktags:queryCmds:toggleFindAsYouType");
            if (elts.length > 0)
            {
                let item= elts.item(0);
                if (disableFindAsYouType) item.removeAttribute("checked");
                else item.setAttribute("checked", "true");
            }
        }
    };

    Builder.prototype.
    updateQueryInputCompletions= function ()
    {
        if (!this.tagInput) return;

        if (restrictQueryInputCompletions)
        {
            this.tagInput.completions= this.relTagsNames;
        }
        else this.tagInput.completions= tagNameList;
    };

    return {
        make:             make,
        Builder:          Builder
    };
}();
