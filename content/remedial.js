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

/**
 * Searches for targetItem in the array, returning either the item
 * equal to targetItem or the first element greater than targetItem
 * if no such item exists.
 */
Array.prototype.binbest= function (targetItem)
{
    var s;

    s= this.binsearch(targetItem);
    if (s.index < this.length) return this[s.index];
    return undefined;
};

Array.prototype.bininsert= function (item)
{
    var s;

    s= this.binsearch(item);
    this.splice(s.index, 0, item);
    return s.found;
};

Array.prototype.binremove= function (item)
{
    var s;

    s= this.binsearch(item);
    if (s.found) return this.splice(s.index, 1)[0];
    return null;
};

/**
 * Array may define comparator; if not, simple inequality is used.  Assumes
 * array is sorted.  Returns { found, index }.  found is true if target is in
 * array and false otherwise.  If found, index is the index of target in array.
 * If not found, index is the index of the first item that's greater than target
 * or array.length if every element is less than target.
 */
Array.prototype.binsearch= function (target)
{
    var fromIndex;
    var toIndex;
    var notFound;
    var i;
    var c;

    fromIndex= 0;
    toIndex= this.length - 1;

    while (fromIndex <= toIndex)
    {
        i= Math.floor((fromIndex + toIndex) / 2);
        if (this.comparator) c= this.comparator(this[i], target);
        else
        {
            // we want weak equality here
            if (this[i] == target) c= 0;
            else if (this[i] < target) c= -1;
            else c= 1;
        }

        if (c === 0) return { found: true, index: i };
        else if (c < 0) fromIndex= i + 1;
        else
        {
            toIndex= i - 1;
            notFound= { found: false, index: i };
        }
    }
    if (!notFound) notFound= { found: false, index: this.length };
    return notFound;
};

Array.prototype.empty= function ()
{
    return this.length === 0;
};

Array.prototype.includes= function (item)
{
    return (this.indexOf(item) >= 0);
};

Array.prototype.last= function ()
{
    if (this.length === 0) return undefined;
    return this[this.length - 1];
};


// Of course the XULTreeBuilder sorting method appears not to use
// localeCompare, hence the need for this method.
String.prototype.compare= function (str)
{
    if (this.valueOf() === str) return 0;
    if (this.valueOf() < str) return -1;
    return 1;
};

String.prototype.lstrip= function ()
{
    return this.replace(/^\s+/, "");
};

String.prototype.strip= function ()
{
    return this.replace(/^\s+|\s+$/g, "");
};
