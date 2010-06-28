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

const CURRENT_VERSION= "4.1.4";

const CI= Components.interfaces;
const CC= Components.classes;
const CR= Components.results;

const catMan=
    CC["@mozilla.org/categorymanager;1"].
    getService(CI.nsICategoryManager);

const obsServ=
    CC["@mozilla.org/observer-service;1"].
    getService(CI.nsIObserverService);

const prefs=
    CC["@mozilla.org/preferences-service;1"].
    getService(CI.nsIPrefService).
    getBranch("bookmarktags.");

// Can't do this on app-startup because profile folder is not ready then,
// and we need local-store.  final-ui-startup is sent right before first window
// of app is displayed. See
// http://developer.mozilla.org/en/docs/Observer_Notifications
const appObserver=
{
    observe: function (subject, topic, data)
    {
        onFinalUIStartup();
    }
};

// 4.0.0 changes:
//   - Removed the default sidebar keybinding.  But, if upgrading from
//     a previous version, ensure:
//       1. If user customized keybinding, don't remove it.  We don't actually
//          have to do anything to not remove it since user prefs persist
//          automatically.
//       2. Otherwise, continue the old accel+` keybinding.
//   - bmt-tagtree, bmt-tagcloud elements removed in favor of
//     box[type="bookmarktags:tagcloud"], tree[type="bookmarktags:tagtree"].
//     Rewrite tag color CSS.
function check400Changes(currVer)
{
    var vers;

    // new install
    if (!currVer) return;

    vers= currVer.split(".");
    if (parseInt(vers[0]) >= 4) return;

    // At this point there was a previous version, and it was less than 4.

    // Sidebar keybinding
    if (!prefs.prefHasUserValue("sidebarKey"))
    {
        prefs.setCharPref("sidebarKey", "accel+`");
    }

    // Tag color CSS.
    try
    {
        // commands.js must be imported first.
        Components.utils.import("resource://bookmarktags/commands.js");
        Components.utils.import("resource://bookmarktags/color.js");
        Components.utils.import("resource://bookmarktags/util.js");
        BookmarkTags.Color= BookmarkTagsColor;
        BookmarkTags.Util= BookmarkTagsUtil;
        BookmarkTags.TagCmds.rewriteTagColorCSS();
    }
    catch (exc) {}
}

// A hack to determine whether the installation is an upgrade from pre-1
// versions (as opposed to a fresh install).  Checks local-store for persisted
// values related to Bookmark Tags.
function isUpgrade()
{
    var localStore;
    var arcs;

    const rdfServ=
        CC["@mozilla.org/rdf/rdf-service;1"].
        getService(CI.nsIRDFService);

    localStore= rdfServ.GetDataSource("rdf:local-store");

    // values related to the sidebar
    arcs=
        localStore.ArcLabelsOut(
            rdfServ.GetResource(
                "chrome://bookmarktags/content/tagBrowserSidebar.xul"));
    if (arcs.hasMoreElements()) return true;

    // values related to the prefs window
    arcs=
        localStore.ArcLabelsOut(
            rdfServ.GetResource("chrome://bookmarktags/content/prefs.xul"));
    if (arcs.hasMoreElements()) return true;

    // if toolbarbuttons are persisted
    navBarSet=
        localStore.GetTarget(
            rdfServ.GetResource("chrome://browser/content/browser.xul#nav-bar"),
            rdfServ.GetResource("currentset"),
            true);
    if (navBarSet &&
        navBarSet instanceof CI.nsIRDFLiteral &&
        /BookmarkTags-sidebarButton|BookmarkTags-bmMenuToolbarbutton/.
            test(navBarSet.Value))
    {
        return true;
    }

    return false;
}

function onAppStartup()
{
    obsServ.addObserver(appObserver, "final-ui-startup", false);
}

// Everything is loaded by the time this is called, so this is the startup
// callback where we do all the real work.
function onFinalUIStartup()
{
    var ver;
    var isUpgr;

    obsServ.removeObserver(appObserver, "final-ui-startup");

    ver= prefs.getCharPref("currentVersion");

    // !ver => pre-2 versions or new install
    if (!ver)
    {
        // Set tag display to cloud if upgrade.
        if (isUpgrade())
        {
            isUpgr= true;
            prefs.setIntPref("tagDisplay", 0);
        }
    }
    if (ver !== CURRENT_VERSION)
    {
        check400Changes(ver);
        prefs.setCharPref("currentVersion", CURRENT_VERSION);
    }
    if (prefs.getBoolPref("show2Welcome"))
    {
        if (isUpgr || isUpgrade()) showWelcome();
        else prefs.setBoolPref("show2Welcome", false);
    }
}

function showWelcome()
{
    var checkState;
    var buttonFlags;
    var buttonPress;

    const strings=
        CC["@mozilla.org/intl/stringbundle;1"].
        getService(CI.nsIStringBundleService).
        createBundle("chrome://bookmarktags/locale/update.properties");
    const prompts=
        CC["@mozilla.org/embedcomp/prompt-service;1"].
        getService(CI.nsIPromptService);

    checkState= { value: false };
    buttonFlags=
        CI.nsIPromptService.BUTTON_TITLE_IS_STRING *
        (CI.nsIPromptService.BUTTON_POS_0 +
         CI.nsIPromptService.BUTTON_POS_1);
    buttonPress=
        prompts.confirmEx(null,
                          strings.GetStringFromName("title"),
                          strings.GetStringFromName("message"),
                          buttonFlags,
                          strings.GetStringFromName("closeButton.label"),
                          strings.GetStringFromName("migrateButton.label"),
                          null,
                          strings.GetStringFromName("suppressCheckbox.label"),
                          checkState);
    if (checkState.value) prefs.setBoolPref("show2Welcome", false);
    if (buttonPress === 1)
    {
        CC["@mozilla.org/embedcomp/window-watcher;1"].
            getService(CI.nsIWindowWatcher).
            openWindow(null, "chrome://bookmarktags/content/migrate.xul",
                       "BookmarkTagsMigrator", "chrome,centerscreen,resizable",
                       null);
    }
}

function BookmarkTags() {}

BookmarkTags.prototype=
{
    QueryInterface: function(iid)
    {
	if (iid.equals(CI.nsIObserver) ||
            iid.equals(CI.nsISupports))
	{
            return this;
	}
	throw CR.NS_ERROR_NO_INTERFACE;
    },
    observe: function (subject, topic, data)
    {
        onAppStartup();
    }
};

// XPCOM BOILERPLATE BELOW
// taken from http://developer.mozilla.org/en/docs/Code_snippets:JS_XPCOM
var initModule=
{
    serviceCID:        Components.ID("{698eda3c-a27f-4c8a-901c-7ea0096f0841}"),
    serviceContractID: "@cs.stanford.edu/people/adw/bookmarktags;1",
    serviceName:       "Bookmark Tags",

    registerSelf: function (compMgr, fileSpec, location, type)
    {
        compMgr= compMgr.QueryInterface(CI.nsIComponentRegistrar);
        compMgr.registerFactoryLocation(this.serviceCID, this.serviceName,
                                        this.serviceContractID, fileSpec,
                                        location, type);
        // Add app-startup observer.
        catMan.addCategoryEntry("app-startup", "BookmarkTagsAppStartupObserver",
                                "service," + this.serviceContractID, true, true);
    },
    unregisterSelf: function (compMgr, fileSpec, location)
    {
        compMgr= compMgr.QueryInterface(CI.nsIComponentRegistrar);
        compMgr.unregisterFactoryLocation(this.serviceCID, fileSpec);

        // Remove app-startup observer.
        catMan.deleteCategoryEntry("app-startup",
                                   "BookmarkTagsAppStartupObserver", true);
    },
    getClassObject: function (compMgr, cid, iid)
    {
        if (!cid.equals(this.serviceCID))
        {
            throw CR.NS_ERROR_NO_INTERFACE
        }
        if (!iid.equals(CI.nsIFactory))
        {
            throw CR.NS_ERROR_NOT_IMPLEMENTED;
        }
        return this.instanceFactory;
    },
    canUnload: function(compMgr)
    {
        return true;
    },
    instanceFactory:
    {
        createInstance: function (outer, iid)
        {
            if (outer !== null) throw CR.NS_ERROR_NO_AGGREGATION;
            return new BookmarkTags().QueryInterface(iid);
        }
    }
};

function NSGetModule(compMgr, fileSpec)
{
    return initModule;
}
