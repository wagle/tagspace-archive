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

BookmarkTags.TreeView= function ()
{
    const atomServ=
        Components.classes["@mozilla.org/atom-service;1"].
        getService(Components.interfaces.nsIAtomService);

    const titleAtom   = atomServ.getAtom("title");
    const leafAtom    = atomServ.getAtom("leaf");
    const contAtom    = atomServ.getAtom("container");
    const tagContAtom = atomServ.getAtom("tagContainer");
    const queryAtom   = atomServ.getAtom("query");

    // Normally tree.columns.getNamedColumn is the best way to get a specific
    // tree column, but when the tree is hidden, tree.columns is null.
    // Fortunately just iterating over the treecols in that case works.
    function getColElt(tree, colId)
    {
        var cols;

        if (tree.columns)
        {
            let col= tree.columns.getNamedColumn(colId);
            if (col) return col.element;
            return null;
        }

        cols= tree.getElementsByTagName("treecol");
        for (let i= 0; i < cols.length; i++)
        {
            if (cols[i].id === colId) return cols[i];
        }
        return null;
    }

    // queryChanged is true if we observed a query change before this is called.
    function rebuild(view, queryChanged)
    {
        var sel;
        var selObjs;
        var oldRowCnt;
        var newRowCnt;

        if (view.queryChanging_)
        {
            if (!queryChanged) return;
            view.queryChanging_= false;
        }

        // If current sort column is different from new one...
        if (view.objSort_ && view.objSort_ !== view.querySort_)
        {
            getColElt(view.tree_, view.objSort_).
                removeAttribute("sortDirection");
        }

        // Save selection.
        // Copying firefox/source/browser/components/places/content/treeView.js
        // in setting selectEventsSuppressed.  Not sure if it's needed.
        sel= view.selection;
        if (sel)
        {
            selObjs= view.selectedObjs;
            sel.selectEventsSuppressed= true;
        }

        oldRowCnt= (view.objArr_ ? view.objArr_.length : 0);
        newRowCnt= view.queryObjArr_.length;

        view.objArr_= view.queryObjArr_;
        view.objHash_= view.queryObjHash_;
        view.objSort_= view.querySort_;

        // Update the treeboxobject.
        view.tree_.treeBoxObject.beginUpdateBatch();
        if (oldRowCnt) view.tree_.treeBoxObject.rowCountChanged(0, -oldRowCnt);
        view.tree_.treeBoxObject.rowCountChanged(0, newRowCnt);
        if (queryChanged) view.tree_.treeBoxObject.scrollToRow(0);
        view.tree_.treeBoxObject.endUpdateBatch();

        // Restore selection.
        if (selObjs)
        {
            view.selectedObjs= selObjs;
            sel.selectEventsSuppressed= false;
        }

        setTitleColLabel(view);
        setColSortDir(view);
    }

    function setColSortDir(view)
    {
        var colElt;
        var dir;

        colElt= getColElt(view.tree_, view.querySort_);
        if (colElt)
        {
            switch (view.querySortDir_)
            {
            case "ASC":
                dir= "ascending";
                break; 
            case "DESC":
                dir= "descending";
                break;
            }
            if (dir) colElt.setAttribute("sortDirection", dir);
        }
    }

    function setTitleColLabel(view)
    {
        var lbl;
        var titleColElt;

        titleColElt= getColElt(view.tree_, "title");
        if (titleColElt)
        {
            let strings= BookmarkTags.Util.getStrings("query.properties");
            lbl= view.getTitleColLabel_(strings);
            titleColElt.setAttribute("label",
                                     lbl.replace("**COUNT**", view.rowCount));
        }
    }

    function View()
    {
        this.query_= null;
        this.objArr_= null;
        this.objHash_= null;
        this.objSort_= null;
        this.selection_= null;
    }

    View.prototype=
    {
        get allObjs()
        {
            if (!this.query_) return [];
            return this.objArr_.slice(0);
        },

        get query()
        {
            return this.query_;
        },

        set query(val)
        {
            if (this.query_)
            {
                this.removeQueryObserver_();
                this.query_.removeObserver(this);
            }
            this.query_= val;
            this.addQueryObserver_();
            this.query_.addObserver(this);
            rebuild(this);
        },

        get selectedObj()
        {
            var selObjs;

            selObjs= this.selectedObjs;
            if (selObjs.length > 0) return selObjs[0];
            return null;
        },

        get selectedObjs()
        {
            var objs;
            var rangeCount;

            if (!this.query_) return [];

            objs= [];
            rangeCount= this.selection.getRangeCount();
            for (let r= 0; r < rangeCount; r++)
            {
                let min= {};
                let max= {};
                this.selection.getRangeAt(r, min, max);
                for (let o= min.value; o <= max.value; o++)
                {
                    objs.push(this.objArr_[o]);
                }
            }

            return objs;
        },

        set selectedObjs(objs)
        {
            var obj;

            this.selection.clearSelection();
            for (let i= 0; i < objs.length; i++)
            {
                if (objs[i].id !== undefined && objs[i].id !== null)
                {
                    obj= this.objHash_[objs[i].id];
                    if (obj)
                    {
                        // When tree is hidden, toggleSelect throws
                        // NS_ERROR_UNEXPECTED.  That can happen for tag
                        // displays, if the tree is hidden but had a selection
                        // before it was hidden.
                        try
                        {
                            this.selection.toggleSelect(obj.arrIndex);
                        }
                        catch (exc) {}
                    }
                }
            }
        },

        cleanup: function ()
        {
            if (this.query_)
            {
                this.removeQueryObserver_();
                this.query_.removeObserver(this);
                this.query_= null;
            }
            this.selection_= null;
            this.tree_= null;
        },

        ensureSelectedObjExists: function ()
        {
            var obj;

            if (this.selectedObjs.length > 0) return true;
            obj= this.getObjAtRow(0);
            if (!obj) return false;
            this.selectedObjs= [obj];
            return true;
        },

        getObjAtRow: function (row)
        {
            if (!this.query_ || row < 0 || row >= this.objArr_.length)
            {
                return null;
            }
            return this.objArr_[row];
        },

        // Decodes the JSON in the appropriate pref and sets the attributes of
        // the tree's columns to those in the JSON.
        loadColState: function (prefName)
        {
            var table;

            try
            {
                table= JSON.parse(BookmarkTags.Util.prefs.getCharPref(prefName));
            }
            catch (exc)
            {
                try
                {
                    BookmarkTags.Util.prefs.clearUserPref(prefName);
                }
                catch (e) {}
                return;
            }

            for (let i= 0; i < this.tree_.firstChild.childNodes.length; i++)
            {
                let col= this.tree_.firstChild.childNodes.item(i);
                if (col.localName === "treecol" && table[col.id])
                {
                    for (let att in table[col.id])
                    {
                        col.setAttribute(att, table[col.id][att]);
                    }
                }
            }

            return table;
        },

        // Query observer callback.
        onQueryChanged: function (query)
        {
            rebuild(this, true);
        },

        // Query observer callback.
        onQueryChanging: function (query)
        {
            this.queryChanging_= true;
        },

        // Writes the tree's column attributes to prefName.  Attributes are
        // stored in JSON.
        saveColState: function (prefName)
        {
            var atts;
            var table;
            var json;

            // For each column save these attributes.
            atts= ["hidden", "ordinal", "width"];

            table= {};
            for (let i= 0; i < this.tree_.firstChild.childNodes.length; i++)
            {
                let col= this.tree_.firstChild.childNodes.item(i);
                if (col.localName === "treecol")
                {
                    table[col.id]= {};
                    atts.forEach(function (att)
                    {
                        if (col.hasAttribute(att))
                        {
                            table[col.id][att]= col.getAttribute(att);
                        }
                    });
                }
            }

            json= JSON.stringify(table);
            BookmarkTags.Util.prefs.setCharPref(prefName, json);
        },



        // nsITreeView

        get rowCount()
        {
            if (!this.query_) return 0;
            return this.objArr_.length;
        },
        get selection()
        {
            return this.selection_;
        },
        set selection(val)
        {
            this.selection_= val;
        },
        canDrop: function (index, orientation)
        {
            return false;
        },
        cycleCell: function (row, col)
        {
        },
        cycleHeader: function (col)
        {
            if (!this.query_) return;

            // sorted col clicked => toggle query's sort direction
            if (col.id === this.querySort_) this.toggleQuerySortDir_();

            // unsorted col clicked => set query's sort to col keeping current
            // direction
            else this.setQuerySort_(col.id, null);
        },
        drop: function (row, orientation)
        {
        },
        getCellText: function (row, col)
        {
            var val;

            if (!this.query_) return "";

            val= this.objArr_[row][col.id];
            if (!val) return "";

            switch (col.id)
            {
            case "lastModified":
            case "dateAdded":
            case "visit_date":
                Ci= Components.interfaces;
                Cc= Components.classes;
                return PlacesTreeView.prototype._convertPRTimeToString(val);
                break;
            }
            return this.objArr_[row][col.id];
        },
        getCellValue: function (row, col)
        {
            return null;
        },
        getColumnProperties: function (col, properties)
        {
        },
        getImageSrc: function (row, col)
        {
            if (!this.query_) return "";
            if (col.id === "title") return this.objArr_[row].favicon || "";
            return "";
        },
        getLevel: function (index)
        {
            return 0;
        },
        getParentIndex: function (rowIndex)
        {
            return -1;
        },
        getProgressMode: function (row, col)
        {
            return null;
        },
        getRowProperties: function (index, properties)
        {
        },
        hasNextSibling: function (rowIndex, afterIndex)
        {
            if (!this.query_) return false;
            return rowIndex < this.objArr_.length - 1;
        },
        isContainer: function (row)
        {
            return false;
        },
        isContainerEmpty: function (index)
        {
            return true;
        },
        isContainerOpen: function (index)
        {
            return false;
        },
        isEditable: function (row, col)
        {
            return false;
        },
        isSelectable: function (row, col)
        {
            return true;
        },
        isSeparator: function (row)
        {
            return false;
        },
        isSorted: function ()
        {
            return true;
        },
        performAction: function (action)
        {
        },
        performActionOnCell: function (action, row, col)
        {
        },
        performActionOnRow: function (action, row)
        {
        },
        selectionChanged: function ()
        {
        },
        setCellText: function (row, col, value)
        {
        },
        setCellValue: function (row, col, value)
        {
        },
        setTree: function (treebox)
        {
            // ???
            this.treebox= treebox;
        },
        toggleOpenState: function (index)
        {
        }
    };



    // bookmark tree view

    function Bookmark(tree)
    {
        this.tree_= tree;
    }

    Bookmark.prototype= new View();

    Bookmark.prototype.__defineGetter__("queryObjArr_", function ()
    {
        return this.query_.bmArr;
    });

    Bookmark.prototype.__defineGetter__("queryObjHash_", function ()
    {
        return this.query_.bmHash;
    });

    Bookmark.prototype.__defineGetter__("querySort_", function ()
    {
        return this.query_.bmSort;
    });

    Bookmark.prototype.__defineGetter__("querySortDir_", function ()
    {
        return this.query_.bmSortDir;
    });

    Bookmark.prototype.addQueryObserver_= function ()
    {
        this.query_.addBMObserver(this);
    };

    Bookmark.prototype.getCellProperties= function (row, col, properties)
    {
        if (col.id === "title") properties.AppendElement(titleAtom);
        properties.AppendElement(leafAtom);
    };

    Bookmark.prototype.getTitleColLabel_= function (strings)
    {
        if (this.query_.isEmpty())
        {
            return strings.GetStringFromName("allBookmarks.label");
        }
        return strings.GetStringFromName("relatedBookmarks.label");
    };

    Bookmark.prototype.loadColState_= Bookmark.prototype.loadColState;

    Bookmark.prototype.loadColState= function ()
    {
        this.loadColState_("bookmarkTreeColumns");
    };

    Bookmark.prototype.onQueryBMChanged= function (query)
    {
        rebuild(this);
    };

    Bookmark.prototype.removeQueryObserver_= function ()
    {
        this.query_.removeBMObserver(this);
    };

    Bookmark.prototype.saveColState_= Bookmark.prototype.saveColState;

    Bookmark.prototype.saveColState= function ()
    {
        this.saveColState_("bookmarkTreeColumns");
    };

    Bookmark.prototype.setQuerySort_= function (sort, sortDir)
    {
        this.query_.setBMSort(sort, sortDir);
    };

    Bookmark.prototype.toggleQuerySortDir_= function ()
    {
        this.query_.toggleBMSortDir();
    };



    // related tags tree view

    function RelTag(tree)
    {
        this.tree_= tree;
    }

    RelTag.prototype= new View();

    RelTag.prototype.__defineGetter__("queryObjArr_", function ()
    {
        return this.query_.relTagArr;
    });

    RelTag.prototype.__defineGetter__("queryObjHash_", function ()
    {
        return this.query_.relTagHash;
    });

    RelTag.prototype.__defineGetter__("querySort_", function ()
    {
        return this.query_.relTagSort;
    });

    RelTag.prototype.__defineGetter__("querySortDir_", function ()
    {
        return this.query_.relTagSortDir;
    });

    RelTag.prototype.addQueryObserver_= function ()
    {
        this.query_.addRelTagObserver(this);
    };

    RelTag.prototype.getCellProperties= function (row, col, properties)
    {
        if (col.id === "title")
        {
            properties.AppendElement(titleAtom);
            properties.AppendElement(contAtom);
            properties.AppendElement(tagContAtom);
            properties.AppendElement(queryAtom);
        }
        properties.AppendElement(atomServ.getAtom(
            ["bmt_tagname_", this.objArr_[row].title].join("")));
        properties.AppendElement(atomServ.getAtom(
            ["bmt_tagid_", this.objArr_[row].id].join("")));
    };

    RelTag.prototype.getRowProperties= function (index, properties)
    {
        properties.AppendElement(contAtom);
        properties.AppendElement(tagContAtom);
        properties.AppendElement(queryAtom);
        properties.AppendElement(atomServ.getAtom(
            ["bmt_tagname_", this.objArr_[index].title].join("")));
        properties.AppendElement(atomServ.getAtom(
            ["bmt_tagid_", this.objArr_[index].id].join("")));
    };

    RelTag.prototype.getTitleColLabel_= function (strings)
    {
        if (this.query_.isEmpty())
        {
            return strings.GetStringFromName("allTags.label");
        }
        return strings.GetStringFromName("relatedTags.label");
    };

    /*
    // Needed so drag and drop feedback renders row as container.
    // Commented out because dropping on tags isn't yet implemented.
    RelTag.prototype.isContainer= function (row)
    {
        return true;
    };
    */

    RelTag.prototype.loadColState_= RelTag.prototype.loadColState;

    RelTag.prototype.loadColState= function ()
    {
        this.loadColState_("tagTreeColumns");
    };

    RelTag.prototype.onQueryRelTagChanged= function (query)
    {
        rebuild(this);
    };

    RelTag.prototype.removeQueryObserver_= function ()
    {
        this.query_.removeRelTagObserver(this);
    };

    RelTag.prototype.saveColState_= RelTag.prototype.saveColState;

    RelTag.prototype.saveColState= function ()
    {
        this.saveColState_("tagTreeColumns");
    };

    RelTag.prototype.setQuerySort_= function (sort, sortDir)
    {
        this.query_.setRelTagSort(sort, sortDir);
    };

    RelTag.prototype.toggleQuerySortDir_= function ()
    {
        this.query_.toggleRelTagSortDir();
    };



    return {
        Bookmark: Bookmark,
        RelTag:   RelTag
    };
}();
