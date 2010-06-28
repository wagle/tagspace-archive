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

const Cc = Components.classes;
const Ci = Components.interfaces;
const Cu = Components.utils;

Cu.import("resource://gre/modules/XPCOMUtils.jsm");
/*
const prefs=
    Cc["@mozilla.org/preferences-service;1"].
    getService(Ci.nsIPrefService).
    getBranch("bookmarktags.");
*/
const os = Cc["@mozilla.org/observer-service;1"].
	   getService(Ci.nsIObserverService);
function TagSieveService() {}
TagSieveService.prototype =
{
    classDescription: "TagSieve Service",
    contractID: "@grue.in/tagsieve/service;1",
    classID: Components.ID("{1eaf3208-736b-4f7c-997f-713db7825149}"),
    _xpcom_categories: [{ category: "app-startup", service: true }],

    QueryInterface: XPCOMUtils.generateQI([Ci.nsIObserver,
                                            Ci.nsISupportsWeakReference]),

    observe: function BSS__observe(subject, topic, data)
    {
        switch (topic)
        {
            case "app-startup":
                //os.addObserver(this, "", true);
            break;
        }
    }
};
function NSGetModule(compMgr, fileSpec) {
  return XPCOMUtils.generateModule([TagSieveService]);
}
