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

var BookmarkTags= function ()
{
    var panels= [];

    function applyPrefs()
    {
        panels.forEach(function (p) p.apply());
    }

    function applyWidgets(widgetTable, prefTable)
    {
        var i;

        for (i in prefTable)
        {
            switch (prefTable[i])
            {
            case "int":
                BookmarkTags.Util.prefs.setIntPref(i, widgetTable[i].value);
                break;
            case "bool":
                BookmarkTags.Util.prefs.setBoolPref(i, widgetTable[i].checked);
                break;
            case "char":
                BookmarkTags.Util.prefs.setCharPref(i, widgetTable[i].value);
                break;
            default:
                throw "Bookmark Tags: prefs window: " +
                      "unknown preference type" + prefTable[i];
                break;
            }
        }
    }

    function initWidgets(prefTable)
    {
        var widgets;
        var i;

        widgets= {};
        for (i in prefTable)
        {
            widgets[i]= document.getElementById(i);
            switch (prefTable[i])
            {
            case "int":
                widgets[i].value= BookmarkTags.Util.prefs.getIntPref(i);
                break;
            case "bool":
                widgets[i].checked= BookmarkTags.Util.prefs.getBoolPref(i);
                break;
            case "char":
                widgets[i].value= BookmarkTags.Util.prefs.getCharPref(i);
                break;
            default:
                throw "Bookmark Tags: prefs window: " +
                      "unknown preference type " + prefTable[i];
                break;
            }
        }

        return widgets;
    }

    function launchMigrator()
    {
        window.open("chrome://bookmarktags/content/migrate.xul", "",
                    "chrome,centerscreen,resizable");
    }

    function onDialogAccept(event)
    {
        applyPrefs();
        return true;
    }

    function onLoad()
    {
        panels.forEach(function (p) p.init());
        if (window.arguments)
        {
            let initialTab= window.arguments[0];
            document.getElementById("tabbox").selectedTab=
                document.getElementById(initialTab + "Tab");
        }
    }

    function resetPrefs()
    {
        panels.forEach(function (p) p.reset());
    }

    function resetWidgets(prefTable)
    {
        var i;

        for (i in prefTable)
        {
            // Throws an exception if pref is already cleared.
            try
            {
                BookmarkTags.Util.prefs.clearUserPref(i);
            } catch (e) {}
        }
        return initWidgets(prefTable);
    }

    const SidebarPanel= function ()
    {
        var sbKeyArr;      // we trap the last-typed sidebar key here and use
                           // it to manually set the pref; see onKeyEntry
        var modifierNames; // platform-specific modifier key (Ctrl, etc.) names
        var modifierSep;   // platform-specific modifier separator (e.g., "+")
        var widgets;

        const prefTable=
        {
            disableTagInputAutocomplete:   "bool",
            disableFindAsYouType:          "bool",
            restrictQueryInputCompletions: "bool",
            queryCloudTagClickAction:      "int",
            hideQueryCloud:                "bool",
            tagDisplay:                    "int",
            cloudsReflectTagSizes:         "bool",
            sidebarKey:                    "char"
        };

        function apply()
        {
            var sbKeyType;

            sbKeyType= prefTable["sidebarKey"];
            delete prefTable["sidebarKey"];
            applyWidgets(widgets, prefTable);
            prefTable["sidebarKey"]= sbKeyType;

            if (sbKeyArr)
            {
                BookmarkTags.Util.prefs.setCharPref("sidebarKey",
                                                    sbKeyArr.join("+"));
            }
        }

        function clearKey()
        {
            sbKeyArr= [];
            document.getElementById("sidebarKey").value=
                makePlatformKeyStr(sbKeyArr);
        }

        function init()
        {
            var infoLabel;
            var infoLabelText;

            const pfStrings=
                BookmarkTags.Util.stringServ.
                createBundle("chrome://global-platform/locale/platformKeys.properties");
            const strings= BookmarkTags.Util.getStrings("prefs.properties");

            infoLabel= document.getElementById("sidebarKeyInfoLabel");

            modifierNames= [];
            ["alt", "control", "meta", "shift"].forEach(function (k)
            {
                modifierNames[k]=
                    pfStrings.GetStringFromName("VK_" + k.toUpperCase());
            });
            if (BookmarkTags.Util.getOS() === "Darwin")
            {
                modifierNames["accel"]= modifierNames["meta"];
                infoLabelText=
                    strings.GetStringFromName("sidebarKey.infoMac.label");
            }
            else
            {
                modifierNames["accel"]= modifierNames["control"];
                infoLabelText=
                    strings.GetStringFromName("sidebarKey.info.label");
            }
            infoLabel.appendChild(document.createTextNode(infoLabelText));
            modifierSep= pfStrings.GetStringFromName("MODIFIER_SEPARATOR");
            infoLabel.setAttribute("accesskey",
                         strings.GetStringFromName("sidebarKey.info.accesskey"));

            widgets= initWidgets(prefTable);
            initSBKeyWidget();
        }

        function initSBKeyWidget()
        {
            // Textbox value is raw pref value.  Convert it to platform string.
            widgets["sidebarKey"].value=
                makePlatformKeyStr(widgets["sidebarKey"].value.split("+"));
        }

        function makePlatformKeyStr(keyArr)
        {
            if (keyArr.length === 0) return "";
            return keyArr.
                   concat([]).
                   splice(0, keyArr.length - 1).
                   map(function (k) modifierNames[k]).
                   concat([keyArr[keyArr.length - 1]]).
                   join(modifierSep);
        }

        function onKeyEntry(textbox, event)
        {
            event.preventDefault();
            event.stopPropagation();

            // Allow Esc to clear the key.
            if (event.keyCode === event.DOM_VK_ESCAPE)
            {
                clearKey();
                return;
            }
            // Trap displayable keys.
            if (!event.charCode)
            {
                sbKeyArr= null;
                return;
            }

            sbKeyArr= [];

            // Order here seems platform-specific, too... e.g., on Windows,
            // it's always "Ctrl+Shift", not "Shift+Ctrl"...
            if (event.metaKey) sbKeyArr.push("meta");
            if (event.ctrlKey) sbKeyArr.push("control");
            if (event.shiftKey) sbKeyArr.push("shift");
            if (event.altKey) sbKeyArr.push("alt");

            // Transform lowercase letters to uppercase, for looks.
            if (97 <= event.charCode && event.charCode <= 122)
            {
                sbKeyArr.push(String.fromCharCode(event.charCode - 32));
            }
            else if (event.charCode)
            {
                sbKeyArr.push(String.fromCharCode(event.charCode));
            }

            textbox.value= makePlatformKeyStr(sbKeyArr);
        }

        function reset()
        {
            widgets= resetWidgets(prefTable);
            initSBKeyWidget();
        }

        return {
            apply:      apply,
            init:       init,
            reset:      reset,
            clearKey:   clearKey,
            onKeyEntry: onKeyEntry
        }
    }();
    panels.push(SidebarPanel);

    const TagMenuPanel= function ()
    {
        function apply()
        {
            go(function (id)
            {
                BookmarkTags.Util.prefs.setCharPref(
                    id, document.getElementById(id).value);
            });
        }

        function go(callback)
        {
            ["bookmark", "tag"].forEach(function (which)
            {
                ["Sort", "SortDirection"].forEach(function (sort)
                {
                    let id= ["tagMenu.", which, sort].join("");
                    callback(id);
                });
            });
        }

        function init()
        {
            go(function (id)
            {
                let pref= BookmarkTags.Util.prefs.getCharPref(id);
                let mlist= document.getElementById(id);

                for (let i= 0; i < mlist.firstChild.childNodes.length; i++)
                {
                    let mi= mlist.firstChild.childNodes.item(i);
                    if (mi.value === pref)
                    {
                        mlist.selectedIndex= i;
                        break;
                    }
                }
            });
            prepareSortDirMenu("tag");
            prepareSortDirMenu("bookmark");
        }

        function prepareSortDirMenu(which)
        {
            var dirId;
            var dirMlist;
            var dir;
            var sortId;
            var sort;

            dirId= ["tagMenu.", which, "SortDirection"].join("");
            dirMlist= document.getElementById(dirId);
            dir= dirMlist.value;

            sortId= ["tagMenu.", which, "Sort"].join("");
            sort= document.getElementById(sortId).value;

            for (let i= 0; i < dirMlist.firstChild.childNodes.length; i++)
            {
                let menuitem= dirMlist.firstChild.childNodes.item(i);
                if (menuitem.getAttribute("name").split(" ").indexOf(sort) < 0)
                {
                    menuitem.hidden= true;
                }
                else
                {
                    menuitem.hidden= false;
                    if (menuitem.value === dir) dirMlist.selectedItem= menuitem;
                }
            }
        }

        function reset()
        {
            go(function (id)
            {
                try
                {
                    BookmarkTags.Util.prefs.clearUserPref(id);
                }
                catch (e) {}
            });
            init();
        }

        return {
            apply:              apply,
            init:               init,
            prepareSortDirMenu: prepareSortDirMenu,
            reset:              reset
        }
    }();
    panels.push(TagMenuPanel);

    return {
        SidebarPanel:   SidebarPanel,
        TagMenuPanel:   TagMenuPanel,
        applyPrefs:     applyPrefs,
        launchMigrator: launchMigrator,
        onDialogAccept: onDialogAccept,
        onLoad:         onLoad,
        resetPrefs:     resetPrefs
    };
}();
