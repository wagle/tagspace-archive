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
    // XUL elts
    var sbKeyElt;
    var sbBroadcaster;
    var toolbox;

    // other
    var loaded;

    const sbKeyEltId= "BookmarkTags-viewTagBrowserSidebarKey";
    const sbBroadcasterId= "BookmarkTags-viewTagBrowserSidebar";
    const dummyId= "BookmarkTags-dummy";

    window.addEventListener("load", load, false);

    // This only handles commands originating from the bookmark context menu.
    // The tag menu has its own oncommand handler for menuitem clicks.
    const bmController=
    {
        doCommand: function (cmd)
        {
            var menuitem;
            var bmObj;
            var bmPopup;

            menuitem= document.popupNode;
            if (!menuitem) return;

            bmObj= BookmarkTags.BookmarkCmds.makeBMMenuObj(menuitem);
            bmPopup= menuitem.parentNode;

            switch (cmd)
            {
            case "bookmarktags:bmCmds:copy":
                BookmarkTags.BookmarkCmds.copy([bmObj]);
                break;
            case "bookmarktags:bmCmds:cutDelete":
                BookmarkTags.BookmarkCmds.cutDelete([bmObj]);
                break;
            case "bookmarktags:bmCmds:cutUntagAll":
                BookmarkTags.BookmarkCmds.cutUntagAll([bmObj]);
                break;
            case "bookmarktags:bmCmds:cutUntagTags":
                BookmarkTags.BookmarkCmds.cutUntagTags([bmObj], bmPopup.tags);
                break;
            case "bookmarktags:bmCmds:delete":
                BookmarkTags.BookmarkCmds.doDelete([bmObj]);
                break;
            case "bookmarktags:bmCmds:open":
                BookmarkTags.BookmarkCmds.open(bmObj);
                break;
            case "bookmarktags:bmCmds:openInNewWindow":
                BookmarkTags.BookmarkCmds.openInNewWindow(bmObj);
                break;
            case "bookmarktags:bmCmds:openInNewTab":
                BookmarkTags.BookmarkCmds.openInNewTab(bmObj);
                break;
            case "bookmarktags:bmCmds:openInTabs":
                let query= BookmarkTags.Query.emptyQuery();
                query.initWithTags(bmPopup.tags);
                query.executeBM();
                BookmarkTags.BookmarkCmds.openInTabs(
                    BookmarkTags.BookmarkCmds.collectBMMenuObjs(bmPopup));
                break;
            case "bookmarktags:bmCmds:paste":
                BookmarkTags.BookmarkCmds.paste(bmPopup.tags);
                break;
            case "bookmarktags:bmCmds:properties":
                BookmarkTags.BookmarkCmds.properties(bmObj);
                break;
            case "bookmarktags:bmCmds:showInOrganizer":
                BookmarkTags.BookmarkCmds.showInOrganizer(bmObj.id);
                break;
            case "bookmarktags:bmCmds:untagAll":
                BookmarkTags.BookmarkCmds.untagAll([bmObj]);
                break;
            case "bookmarktags:bmCmds:untagTags":
                BookmarkTags.BookmarkCmds.untagTags([bmObj], bmPopup.tags);
                break;
            default:
                let sort= BookmarkTags.BookmarkCmds.isSortCmd(cmd);
                if (sort) setMenuSort("bookmark", sort);
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            if (cmd === "bookmarktags:bmCmds:paste")
            {
                return BookmarkTags.BookmarkCmds.canPaste();
            }
            return true;
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
                return true;
                break;
            }
            return !!BookmarkTags.BookmarkCmds.isSortCmd(cmd);
        },
        onEvent: function (evt) {}
    };

    // This only handles commands originating from the tag context menu.
    // The tag menu has its own oncommand handler for menu clicks.
    const tagController=
    {
        doCommand: function (cmd)
        {
            var menu;
            var popupTagIds;
            var menuTagId;
            var query;

            menu= document.popupNode;
            if (!menu) return;

            popupTagIds= menu.parentNode.tags;
            query= BookmarkTags.Query.queryWithTags(popupTagIds);

            menuTagId= menu.getAttribute("tags").split(",");
            menuTagId= menuTagId[menuTagId.length - 1];

            switch (cmd)
            {
            case "bookmarktags:tagCmds:copy":
                BookmarkTags.TagCmds.copy(menuTagId, query);
                break;
            case "bookmarktags:tagCmds:cut":
                BookmarkTags.TagCmds.cut(menuTagId, query);
                break;
            case "bookmarktags:tagCmds:delete":
                BookmarkTags.TagCmds.doDelete([menuTagId]);
                break;
            case "bookmarktags:tagCmds:openInTabs":
                BookmarkTags.TagCmds.openInTabs(menuTagId, query);
                break;
            case "bookmarktags:tagCmds:paste":
                BookmarkTags.BookmarkCmds.paste(
                    popupTagIds.concat([menuTagId]));
                break;
            case "bookmarktags:tagCmds:properties":
                BookmarkTags.TagCmds.properties(menuTagId);
                break;
            default:
                let sort= BookmarkTags.TagDisplayCmds.isSortCmd(cmd);
                if (sort) setMenuSort("tag", sort);
                break;
            }
        },
        isCommandEnabled: function (cmd)
        {
            if (cmd === "bookmarktags:tagCmds:paste")
            {
                return BookmarkTags.BookmarkCmds.canPaste();
            }
            return true;
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
                return true;
                break;
            }
            return !!BookmarkTags.TagDisplayCmds.isSortCmd(cmd);
        },
        onEvent: function (evt) {}
    };

    // When the sidebar key preference is updated, we modify the key element
    // accordingly.
    const prefsObserver=
    {
        observe: function (subject, topic, data) { updateSidebarKey(); }
    };

    function load(event)
    {
        if (loaded) return;
        loaded= true;
        sbKeyElt= document.getElementById(sbKeyEltId);
        sbBroadcaster= document.getElementById(sbBroadcasterId);
        toolbox= document.getElementById("navigator-toolbox");

        // The tag menu in the bookmarks popup does not work well on Macs.
        //if (BookmarkTags.Util.getOS() === "Darwin")
        //{
        // hide for all
           document.getElementById("BookmarkTags-tagMenuBookmarksPopup").
               hidden= true;
        //}

        updateSidebarKey();
        loadCuteMenusFix();

        window.removeEventListener("load", load, false);
        window.addEventListener("unload", unload, false);
        toolbox.addEventListener("DOMMenuItemActive", onMenuActive, false);
        toolbox.addEventListener("DOMMenuItemInactive", onMenuInactive, false);
        BookmarkTags.Util.prefs.
            QueryInterface(BookmarkTags.Util.CI.nsIPrefBranch2).
            addObserver("sidebarKey", prefsObserver, false);

        window.controllers.appendController(bmController);
        window.controllers.appendController(tagController);
    }

    // The CSS rules of Cute Menus and other extensions and themes that add
    // icons to Firefox's menus are inserted after our tag menu binding rule
    // (menu[type="bookmarktags:tagmenu"]).  Their binding, which is something
    // like
    // menupopup menu[label] {
    // -moz-binding: url(chrome://global/content/bindings/menu.xml#menu-iconic);
    // }
    // wins, we lose, and the result is tag menus never open.  To get around it,
    // (re)load the tag menu stylesheet as a user sheet.
    function loadCuteMenusFix()
    {
        BookmarkTags.Util.loadStylesheet(
            "chrome://bookmarktags/content/tagMenu.css");
    }

    // For the tag menus (toolbarbutton and Bookmarks menu).  Updates statusbar.
    function onMenuActive(event)
    {
        var elt;

        elt= event.target;
        if (elt.parentNode &&
            elt.parentNode.getAttribute("type") === "bookmarktags:tagpopup")
        {
            window.XULBrowserWindow.setOverLink(elt.getAttribute("statustext"),
                                                null);
        }
    }

    // For the tag menus (toolbarbutton and Bookmarks menu).  Updates statusbar.
    function onMenuInactive(event)
    {
        var elt;

        elt= event.target;
        if (elt.parentNode &&
            elt.parentNode.getAttribute("type") === "bookmarktags:tagpopup" &&
            (document.getElementById("BookmarkTags-bmMenuToolbarbutton") &&
            !document.getElementById("BookmarkTags-bmMenuToolbarbutton").open) &&
            !document.getElementById("BookmarkTags-tagMenuBookmarksPopup").open)
        {
            window.XULBrowserWindow.setOverLink("", null);
        }
    }

    function prepareBMSortMenu(popup)
    {
        prepareSortMenu(
            popup, "tagMenu.bookmarkSort", "tagMenu.bookmarkSortDirection");
    }

    function prepareSortMenu(popup, sortPref, sortDirPref)
    {
        var sort;
        var dir;

        sort= BookmarkTags.Util.prefs.getCharPref(sortPref);
        dir= BookmarkTags.Util.prefs.getCharPref(sortDirPref);
        BookmarkTags.Util.prepareSortMenu(popup, sort, dir);
    }

    function prepareTagSortMenu(popup)
    {
        prepareSortMenu(popup, "tagMenu.tagSort", "tagMenu.tagSortDirection");
    }

    function setMenuSort(which, sort)
    {
        if (sort[0] === "sort")
        {
            BookmarkTags.Util.prefs.setCharPref(
                ["tagMenu.", which, "Sort"].join(""), sort[1]);
        }
        else
        {
            BookmarkTags.Util.prefs.setCharPref(
                ["tagMenu.", which ,"SortDirection"].join(""), sort[1]);
        }
    }

    function unload(event)
    {
        window.removeEventListener("unload", unload, false);
        toolbox.removeEventListener("DOMMenuItemActive", onMenuActive, false);
        toolbox.removeEventListener("DOMMenuItemInactive", onMenuInactive,
                                    false);
        BookmarkTags.Util.prefs.
            QueryInterface(Components.interfaces.nsIPrefBranch2).
            removeObserver("sidebarKey", prefsObserver, false);

        window.controllers.removeController(bmController);
        window.controllers.removeController(tagController);

        unloadCuteMenusFix();
    }

    function unloadCuteMenusFix()
    {
        BookmarkTags.Util.unloadStylesheet(
            "chrome://bookmarktags/content/tagMenu.css");
    }

    function updateSidebarKey()
    {
        var keyArr;

        // There's gotta be a better way to do all this.

        // split returns a single-element array containing the empty string
        // if the original string is empty.  Nice.
        keyArr= BookmarkTags.Util.prefs.getCharPref("sidebarKey").split("+");
        if (keyArr.length === 0 ||
            (keyArr.length === 1 && keyArr[0].length === 0))
        {
            // Removing attributes seems not to work; because of persist (I
            // think), the attributes retain their values.  Setting them to
            // the IDs of nonexistent elements seems to work.
            sbBroadcaster.setAttribute("key", dummyId);
            sbKeyElt.setAttribute("command", dummyId);
        }
        else
        {
            sbKeyElt.setAttribute("key", keyArr[keyArr.length - 1]);
            sbKeyElt.setAttribute("modifiers",
                                  keyArr.slice(0, keyArr.length - 1).join(" "));
            sbKeyElt.setAttribute("command", sbBroadcasterId);
            sbBroadcaster.setAttribute("key", sbKeyEltId);
        }
    }

    return {
        load:               load,
        prepareBMSortMenu:  prepareBMSortMenu,
        prepareTagSortMenu: prepareTagSortMenu,
        unload:             unload
    };
}();
