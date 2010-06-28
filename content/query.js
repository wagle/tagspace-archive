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

BookmarkTags.Query= function ()
{
    var opRegexStr;     // char class (no []) of op input lexemes: ",&|+\-!~?"
    var tagOpRegexStr;  // char class of tag op input lexemes: ",&|+\-!~"
    var opTable;        // input lexeme => operator token object

    var queries;        // array of queries registered with registerQuery
    var dbConn;         // one connection to profile:places.sqlite
    var dbConnIsShared; // Fx 3.1: see initDBConn

    const Cc= Components.classes;
    const Ci= Components.interfaces;

    // SQLite column types: Reading
    // firefox/source/toolkit/components/places/src/nsNavHistory.cpp and
    // firefox/source/toolkit/components/places/src/nsNavBookmarks.cpp
    // tells us that for integers we expect:
    //   32-bit: visit count, frecency
    //   64-bit: IDs, dates

    const BM_SQL_COLS=
    {
        getUTF8String: ["favicon", "title", "url"],
        getInt32:      ["frecency", "visit_count"],
        getInt64:      ["dateAdded", "id", "lastModified", "visit_date"]
    };

    const REL_TAG_SQL_COLS=
    {
        getUTF8String: ["title"],
        getInt32:      ["relatedSize"],
        getInt64:      ["dateAdded", "id", "lastModified"]
    };

    // Really we should be getting the same data as in the related tags case,
    // but currently only the query cloud in the tag browser uses this.
    const TAG_SQL_COLS=
    {
        getUTF8String: ["title"],
        getInt64:      ["id"]
    };

    const FAVICON_ANNO_PREFIX= "moz-anno:favicon:";

    const TOK_TYPE=
    {
        get OPERATOR()  { return 1; },
        // generic operand, replaced with TAG or BM_SEARCH during parsing
        get OPERAND()   { return 2; },
        get TAG()       { return 3; },
        get BM_SEARCH() { return 4; }
    };

    // operator associativity
    const ASSOC=
    {
        get NONE() { return 1; },
        get FULL() { return 2; },
        get LEFT() { return 3; }
    };

    // used in bookmark searching SQL LIKE expressions
    const sqlQuoteRegex= /'/g;
    const sqlQuoteEscaped= "''";
    const sqlLikeEsc= "#"; // don't make this "-"; see regex below
    const sqlLikeRegex= new RegExp("[%_" + sqlLikeEsc + "]", "g");

    // Be careful: in regexen we assume input lexemes are only 1 character long.
    const OP_TOK=
    {
        INTERSECTION:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 1 },
            get associativity() { return ASSOC.FULL },
            get arity()         { return 2 },
            get outputLexeme()  { return ", " },
            get inputLexemes()  { return [ "," , "&" ] }
        },
        UNION:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 1 },
            get associativity() { return ASSOC.FULL },
            get arity()         { return 2 },
            get outputLexeme()  { return " + " },
            get inputLexemes()  { return [ "+" , "|" ] }
        },
        DIFFERENCE:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 1 },
            get associativity() { return ASSOC.LEFT },
            get arity()         { return 2 },
            get outputLexeme()  { return " - " },
            get inputLexemes()  { return [ "-" ] }
        },
        COMPLEMENT:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 2 },
            get associativity() { return ASSOC.NONE },
            get arity()         { return 1 },
            get outputLexeme()  { return "!" },
            get inputLexemes()  { return [ "!" , "~" ] }
        },
        BM_SEARCH:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 2 },
            get associativity() { return ASSOC.NONE },
            get arity()         { return 1 },
            get outputLexeme()  { return "?" },
            get inputLexemes()  { return [ "?" ] }
        },
        LPAREN:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 0 },
            get associativity() { return ASSOC.NONE },
            get outputLexeme()  { return "(" },
            get inputLexemes()  { return [ "(" ] }
        },
        RPAREN:
        {
            get type()          { return TOK_TYPE.OPERATOR },
            get precedence()    { return 0 },
            get associativity() { return ASSOC.NONE },
            get outputLexeme()  { return ")" },
            get inputLexemes()  { return [ ")" ] }
        }
    };

    function addQueryObserver(queryObsArr, obsObj)
    {
        var idx;

        idx= queryObsArr.indexOf(obsObj);
        if (idx >= 0)
        {
            BookmarkTags.Util.logBug(
                "Tried to add already registered query observer");
            return;
        }
        queryObsArr.push(obsObj);
    }

    function bmFkClause(bmFks, colName)
    {
        return (bmFks && bmFks.length > 0 ?
                [" AND ", colName, " IN (", bmFks.join(","), ") "].join("") :
                "");
    }

    function bmSQL(query, bmFks)
    {
        var sql;

        if (query.isEmpty()) sql= bmSQLEmpty(bmFks);
        else sql= bmSQLNonempty(query, bmFks);

        if (!sql) return sql;
        return wrapBMSQL(query, sql);
    }

    function bmSQLEmpty(bmFks)
    {
        return [
            "SELECT DISTINCT bms.fk AS id ",
            "FROM moz_bookmarks AS bms, moz_bookmarks AS tags ",
            "WHERE bms.parent = tags.id AND ",
                  "tags.parent = ", BookmarkTags.Util.bmServ.tagsFolder,
                   bmFkClause(bmFks, "bms.fk")
        ].join("");
    }

    function bmSQLNonempty(query, bmFks)
    {
        if (query.isSimple()) return bmSQLNonemptyOpt(query.tagIds(), bmFks);
        return sqlRelNonempty(
                query,
                function () { return bmSQLEmpty(bmFks); },
                function (tagId) { return bmSQLTag(tagId, bmFks); },
                function (searchStr) { return bmSQLSearch(searchStr, bmFks); });
    }

    function bmSQLNonemptyOpt(tags, bmFks)
    {
        return [
            "SELECT fk AS id ",
            "FROM moz_bookmarks ",
            "WHERE parent IN (", tags.join(","), ") ", bmFkClause(bmFks, "fk"),
            "GROUP BY fk ",
            "HAVING count(*) = ", tags.length
        ].join("");
    }

    function bmSQLSearch(searchStr, bmFks)
    {
        // INTERSECT is faster than doing this all with joins; this SQL will
        // be used in compound statements so wrap it
        return [
            "SELECT * FROM (",
              "SELECT moz_bookmarks.fk AS id ",
              "FROM moz_bookmarks, moz_places ",
              "WHERE moz_places.id = moz_bookmarks.fk AND ",
                     sqlLikeClause(searchStr, "moz_bookmarks", "moz_places"),
                     " ",
                     bmFkClause(bmFks, "moz_bookmarks.fk"),
              "INTERSECT ",
              "SELECT bms.fk AS id ",
              "FROM moz_bookmarks AS bms, moz_bookmarks AS tags ",
              "WHERE bms.parent = tags.id AND ",
                    "tags.parent = ", BookmarkTags.Util.bmServ.tagsFolder,
                     bmFkClause(bmFks, "bms.fk"),
            ")"
        ].join("");
    }

    function bmSQLTag(tagId, bmFks)
    {
        return [
            "SELECT fk AS id FROM moz_bookmarks WHERE parent = ", tagId,
             bmFkClause(bmFks, "fk")
        ].join("");
    }

    function cleanupDBConn()
    {
        if (dbConn && !dbConnIsShared) dbConn.close();
        dbConn= null;
    }

    // Convenience function for making a new Query.
    function emptyQuery(autoexec, bmSort, bmSortDir, relTagSort,
                        relTagSortDir)
    {
        return new Query([], autoexec, bmSort, bmSortDir, relTagSort,
                         relTagSortDir);
    }

    function ensureSortPrefsValid()
    {
        // sorts
        [["bookmarkSort", BM_SQL_COLS], ["tagSort", REL_TAG_SQL_COLS]].
        forEach(function (arr)
        {
            let valid= [];
            for each (let colNames in arr[1])
            {
                valid= valid.concat(colNames);
            }
            if (valid.indexOf(BookmarkTags.Util.prefs.getCharPref(arr[0])) < 0)
            {
                BookmarkTags.Util.prefs.clearUserPref(arr[0]);
            }
        });

        // sort directions
        ["bookmarkSortDirection", "tagSortDirection"].forEach(function (dir)
        {
            let pref= BookmarkTags.Util.prefs.getCharPref(dir);
            if (["ASC", "DESC"].indexOf(pref) < 0)
            {
                BookmarkTags.Util.prefs.clearUserPref(dir);
            }
        });
    }

    function escapeOperators(str)
    {
        const regex= new RegExp(["([", opRegexStr, "])"].join(""), "g");
        return str.replace(regex, "\\$1");
    }

    // Because a query's observers should be notified only when the query itself
    // changes, this should only be called when query changes.
    function executeQuery(query, force)
    {
        if (!query.autoexec && !force) return;
        notifyQueryObservers(query, query.observers, "onQueryChanging");
        executeQueryTag(query);
        executeQueryRelTag(query);
        executeQueryBM(query);
        notifyQueryObservers(query, query.observers, "onQueryChanged");
    }

    // If bmFks is specified, it must be an array of foreign keys in the
    // bookmarks table, i.e., moz_bookmarks.fk.  Only those bookmarks whose fk's
    // are in bmFks will be updated.
    function executeQueryBM(query, force, bmFks)
    {
        var rv;

        if (!query.autoexec && !force) return;

        rv= executeQueryStmts(bmSQL(query, bmFks), BM_SQL_COLS);
        if (rv)
        {
            if (bmFks)
            {
                let bmArr= rv[0];
                for (let i= 0; i < bmArr.length; i++)
                {
                    let bmObj= query.bmHash[bmArr[i].id];
                    if (bmObj)
                    {
                        let arrIndex= bmObj.arrIndex;
                        query.bmArr[arrIndex]= bmArr[i];
                        query.bmHash[bmArr[i].id]= bmArr[i];
                        query.bmArr[arrIndex].arrIndex= arrIndex;
                    }
                    else
                    {
                        BookmarkTags.Util.logBug(
                            "executeQueryBM: fk in bmFks does " +
                            "not correspond to tag in query");
                    }
                }
            }
            else [query.bmArr, query.bmHash]= rv;
            notifyQueryObservers(query, query.bmObservers, "onQueryBMChanged");
        }
    }

    function executeQueryRelTag(query, force)
    {
        var rv;

        if (!query.autoexec && !force) return;

        rv= executeQueryStmts(relTagSQL(query), REL_TAG_SQL_COLS);
        if (rv)
        {
            [query.relTagArr, query.relTagHash, query.relTagMaxRelatedSize]= rv;
            notifyQueryObservers(query,
                                 query.relTagObservers,
                                 "onQueryRelTagChanged");
        }
    }

    function executeQueryStmts(sql, sqlCols)
    {
        var dbStmt;
        var success;
        var objArr;
        var objHash;
        var relTagMaxRelatedSize;

        if (!dbConn) return null;

        success= true;
        objArr= [];
        objHash= {};
        relTagMaxRelatedSize= 0;

        try
        {
            dbStmt= dbConn.createStatement(sql);
            while (dbStmt.executeStep())
            {
                let obj= { arrIndex: objArr.length };
                for (let funcName in sqlCols)
                {
                    let colNames= sqlCols[funcName];
                    for (let c= 0; c < colNames.length; c++)
                    {
                        let colName= colNames[c];
                        let colIdx= dbStmt.getColumnIndex(colName);
                        obj[colName]= dbStmt[funcName](colIdx);
                    }
                }
                objArr.push(obj);
                objHash[obj.id]= obj;

                // While we're here, we do some bookkeeping for tag clouds.
                // Store the biggest related size so clouds can compute tag
                // label size.
                if (obj.relatedSize !== undefined &&
                    obj.relatedSize > relTagMaxRelatedSize)
                {
                    relTagMaxRelatedSize= obj.relatedSize;
                }
            }
        }
        catch (exc)
        {
            success= false;
            BookmarkTags.Util.logErr("executeQueryStmts failed: " + exc +
                                     "\n\nSQL was:\n" + sql);
        }
        finally
        {
            if (dbStmt)
            {
                dbStmt.reset();
                // see http://wizzrss.blat.co.za/2007/09/30/wizz-rss-3-part-3/
                // for a note on finalize
                dbStmt.finalize();
                dbStmt= null;
            }
        }

        if (success) return [objArr, objHash, relTagMaxRelatedSize];
        return null;
    }

    function executeQueryTag(query, force)
    {
        var rv;

        if (!query.autoexec && !force) return;

        rv= executeQueryStmts(tagSQL(query), TAG_SQL_COLS);
        if (rv)
        {
            [query.tagArr, query.tagHash]= rv;
            notifyQueryObservers(query,
                                 query.tagObservers,
                                 "onQueryTagChanged");
        }
    }

    // Repairs queue by stepping through it, discarding misplaced operators
    // and operands.  Returns a new, postfix-legal queue.
    function fixQueue(queue)
    {
        var workStack;
        var tok1;
        var tok2;

        workStack= [];
        queue.forEach(function (tokObj)
        {
            switch (tokObj.type)
            {
            case TOK_TYPE.OPERAND:
            case TOK_TYPE.TAG:
            case TOK_TYPE.BM_SEARCH:
                workStack.push([tokObj]);
                break;
            case TOK_TYPE.OPERATOR:
                switch (tokObj.arity)
                {
                case 1:
                    tok1= workStack.pop();
                    if (tok1) workStack.push(tok1.concat(tokObj));
                    break;
                case 2:
                    tok2= workStack.pop();
                    tok1= workStack.pop();
                    if (tok1) workStack.push(tok1.concat(tok2).concat(tokObj));
                    else if (tok2) workStack.push(tok2);
                    break;
                }
                break;
            }
        });

        if (workStack.length === 0) return [];

        // Choice here: workStack[0] or workStack.last() -- they may not be the
        // same.  workStack[0] is left-most valid expression.
        return workStack[0];
    }

    function forceExecute(query, execFunc)
    {
        if (!query.autoexec) registerQuery(query);
        execFunc(query, true);
        if (!query.autoexec) unregisterQuery(query);
    }

    // Returns array of foreign keys (i.e., moz_bookmarks.fk's) for the given
    // array of bookmark IDs.
    function getBMFKs(bmIds)
    {
        var sql;
        var bms;
        var dbStmt;

        sql= [
            "SELECT fk FROM moz_bookmarks WHERE id IN (", bmIds.join(","), ")"
        ].join("");

        bms= [];

        try
        {
            // dbConn will be valid because this function is only ever called
            // to help execute a query, and if there's a query executing,
            // there's dbConn.
            dbStmt= dbConn.createStatement(sql);
            while (dbStmt.executeStep())
            {
                bms.push(dbStmt.getInt64(0));
            }
        }
        catch (exc)
        {
            BookmarkTags.Util.logErr("getBMFKs: " + exc);
        }
        finally
        {
            dbStmt.reset();
            dbStmt.finalize();
            dbStmt= null;
        }

        return bms;
    }

    function init()
    {
        opTable= {};
        opRegexStr= "";
        tagOpRegexStr= "";

        for each (let opObj in OP_TOK)
        {
            for (let i= 0; i < opObj.inputLexemes.length; i++)
            {
                let lex= opObj.inputLexemes[i];

                opTable[lex]= opObj;

                let escLex= (lex === "-" ? "\\-" : lex);
                opRegexStr += escLex;
                if (opObj !== OP_TOK.BM_SEARCH) tagOpRegexStr += escLex;
            }
        }

        queries= [];
    }

    function initDBConn()
    {
        try
        {
                dbConnIsShared= true;
                dbConn= Cc["@mozilla.org/browser/nav-history-service;1"].
                        getService(Ci.nsPIPlacesDatabase).
                        DBConnection;
        }
        catch (exc)
        {
            dbConn= null;
            BookmarkTags.Util.logErr("Could not open Places database: " + exc);
        }
    }

    function makeBMObsCallback(query)
    {
        return function (changes)
        {
            // Here's the deal.  The high-level native functions that wrap the
            // calls that modify the places database -- those of toolkit/
            // components/places/src/nsNavBookmarks.cpp for example --
            // immediately start SQLite transactions that are scoped to the
            // the entire lives of the functions.  That is, as long as one of
            // these functions is executing, its transaction remains active.
            // But it's these functions who notify observers of changes.  So
            // when they call us, their transactions are still active, and we
            // can't touch the database.  That sucks.  A simple way around it
            // is to use a timeout, but I'm not sure if it's foolproof.
            setTimeout(function ()
            {
                // Tagged bookmark added to, removed from folder.  The query
                // itself need not be executed, but everything else does.
                if (changes.parentArr.length > 0)
                {
                    executeQueryTag(query);
                    executeQueryRelTag(query);
                    executeQueryBM(query);
                }

                // Bookmark property changed.  Because favicon, visit_date,
                // frecency, etc. are often changed for individual particular
                // bookmarks, it's too slow and wasteful to rebuild the query's
                // entire bmArr.  Instead we execute only for the changed
                // bookmarks by getting their fk's.
                else
                {
                    let bmInQuery= false;
                    let childArr= changes.childArr;
                    for (let c= 0; !bmInQuery && c < childArr.length; c++)
                    {
                        // Currently if this observer is called, query.bmHash is
                        // defined.
                        if (query.bmHash[childArr[c]]) bmInQuery= true;
                    }
                    if (bmInQuery)
                    {
                        // If changed property is what we're sorting on, we
                        // have no choice but to rebuild the entire bmArr.
                        let fks=
                            (changes.propHash.hasOwnProperty(query.bmSort) ?
                             null :
                             getBMFKs(childArr));
                        executeQueryBM(query, false, fks);
                    }
                }
            }, 0);
        };
    }

    function makeBMSearchTok(searchStr)
    {
        return { type: TOK_TYPE.BM_SEARCH, str: searchStr };
    }

    function makeOperandTok(lexeme)
    {
        return { type: TOK_TYPE.OPERAND, lexeme: lexeme };
    }

    function makeTagObsCallback(query)
    {
        return function (changes)
        {
            // See makeBMObsCallback for note on setTimeout.
            setTimeout(function ()
            {
                var removedTags;
                var removedTagIds;
                var tags;
                var bmExec;
                var tagExec;
                var relTagExec;

                removedTags= false; // true => query needs rebuilding
                removedTagIds= {};

                tags= query.tags();

                // query needs rebuilding if:
                //   tag in query removed
                // tagArr alone needs rebuilding if:
                //   tag in query renamed or modified
                // relTagArr alone needs rebuilding if:
                //   any tag added, removed, renamed, or modified (consider
                //   query !A)
                // bmArr alone needs rebuilding if:
                //   any tag added or removed (consider query !A)

                for (let [prop, propObj] in Iterator(changes.propHash))
                {
                    let childHash= propObj.childHash;

                    switch (prop)
                    {
                    case "added":
                        bmExec= true;
                        relTagExec= true;
                        break;
                    case "removed":
                        bmExec= true;
                        relTagExec= true;
                        for (let t= 0; t < tags.length; t++)
                        {
                            if (childHash.hasOwnProperty(tags[t].id))
                            {
                                removedTags= true;
                                removedTagIds[tags[t].id]= true;
                            }
                        }
                        break;
                    case "title":
                    case "lastModified":
                        relTagExec= true;
                        for (let t= 0; t < tags.length; t++)
                        {
                            if (childHash.hasOwnProperty(tags[t].id))
                            {
                                tagExec= true;
                                if (prop === "title")
                                {
                                    tags[t].title= childHash[tags[t].id].data;
                                }
                            }
                        }
                        break;
                    }
                }

                // If a tag in the query was removed, modifying the query via
                // select causes the query to be executed, so we don't need to
                // bother checking for the other exec cases.
                if (removedTags)
                {
                    query.select(function (tagTok)
                    {
                        return !removedTagIds.hasOwnProperty(tagTok.id);
                    });
                }
                else
                {
                    if (tagExec) executeQueryTag(query);
                    if (relTagExec) executeQueryRelTag(query);
                    if (bmExec) executeQueryBM(query);
                }
            }, 0);
        };
    }

    // You should not rely on tagName's being accurate.  It's not modified by
    // the query code here, but anybody with a reference to a query is free to
    // modify a tag token's title for his own needs.  tagName may not even
    // represent an existing tag -- see the parse function and the tag input
    // for example.  tagId, on the other hand, must be kept accurate at all
    // times when nonnull and should be used to retrieve the tag's title from
    // the bookmarks service when tag name accuracy is critical.
    function makeTagTok(tagName, tagId)
    {
        return { type: TOK_TYPE.TAG, title: tagName, id: tagId };
    }

    function notifyQueryObservers(query, queryObsArr, obsCallbackFuncName)
    {
        queryObsArr.forEach(function (obs)
        {
            try
            {
                obs[obsCallbackFuncName](query);
            }
            catch (exc if exc instanceof TypeError) {}
        });
    }

    function parse(str)
    {
        return new Query(parse2(fixQueue(parse1(str))));
    }

    // First phase of parsing.  Converts infix expression in str to postfix
    // queue with generic operands.
    function parse1(str)
    {
        var outputQueue;
        var operatorStack;
        var match;
        var prevTokObj;

        const scanRegex= new RegExp([
            "^[", opRegexStr, "]|(\\\\[" + opRegexStr + "]|[^", opRegexStr,
            "])+"
        ].join(""));

        function reduce(condition)
        {
            while (operatorStack.length > 0)
            {
                let top= operatorStack[operatorStack.length - 1];
                if (condition(top)) outputQueue.push(operatorStack.pop());
                else break;
            }
        }

        outputQueue= [];
        operatorStack= [];

        for (match= scanRegex.exec(str);
             match && match[0];
             match= scanRegex.exec(str))
        {
            let tok= match[0];

            str= str.substr(tok.length);
            tok= tok.replace(/^\s+|\s+$/g, "");
            if (!tok) continue;

            let opObj= (opTable[tok] ? opTable[tok] : null);
            switch (opObj)
            {
            case OP_TOK.LPAREN:
                // "... ) (" or "... OPERAND (" => intersection
                if (prevTokObj &&
                    (prevTokObj === OP_TOK.RPAREN ||
                     prevTokObj.type === TOK_TYPE.OPERAND))
                {
                    str= OP_TOK.INTERSECTION.inputLexemes[0] + tok + str;
                }
                else
                {
                    prevTokObj= opObj;
                    operatorStack.push(prevTokObj);
                }
                break;
            case OP_TOK.RPAREN:
                reduce(function (top) top && top !== OP_TOK.LPAREN);
                if (operatorStack.length > 0 &&
                    operatorStack[operatorStack.length - 1] === OP_TOK.LPAREN)
                {
                    operatorStack.pop();
                }
                prevTokObj= opObj;
                break;
            // operand
            case null:
                // "... ) OPERAND" => intersection
                if (prevTokObj && prevTokObj === OP_TOK.RPAREN)
                {
                    str= OP_TOK.INTERSECTION.inputLexemes[0] + tok + str;
                }
                else
                {
                    prevTokObj= makeOperandTok(unescapeOperators(tok));
                    outputQueue.push(prevTokObj);
                }
                break;
            // non-parenthesis operator
            default:
                // "... ) UNARY-OP" or "... OPERAND UNARY-OP" => intersection
                if (opObj.arity === 1 &&
                    prevTokObj &&
                    (prevTokObj === OP_TOK.RPAREN ||
                     prevTokObj.type === TOK_TYPE.OPERAND))
                {
                    str= OP_TOK.INTERSECTION.inputLexemes[0] + tok + str;
                }
                else
                {
                    reduce(function (top)
                    {
                        return opObj.precedence <= top.precedence &&
                               (opObj.associativity === ASSOC.FULL ||
                                opObj.associativity === ASSOC.LEFT);
                    });
                    prevTokObj= opObj;
                    operatorStack.push(prevTokObj);
                }
            }
        }
        reduce(function (top) (prevTokObj.type === TOK_TYPE.OPERAND ||
                               top.precedence > prevTokObj.precedence));

        return outputQueue;
    }

    // Second phase of parsing.  Assumes queue has been fixed.  Removes bookmark
    // search operators and converts generic operands to real operands, either
    // tags or bookmark searches.
    function parse2(queue)
    {
        var workStack;
        var newQueue;

        workStack= [];
        newQueue= [];

        // Pass 1: Attach to each operand token the subtype token, either a tag
        // token or bookmark search token.
        queue.forEach(function (tokObj)
        {
            switch (tokObj.type)
            {
            case TOK_TYPE.OPERAND:
                // operands are tags unless specified otherwise
                tokObj.subTokObj= makeTagTok(tokObj.lexeme, null);
                newQueue.push(tokObj);
                workStack.push([tokObj]);
                break;
            case TOK_TYPE.OPERATOR:
                if (tokObj === OP_TOK.BM_SEARCH)
                {
                    workStack[workStack.length - 1].forEach(function (tokObj)
                    {
                        tokObj.subTokObj= makeBMSearchTok(tokObj.lexeme);
                    });
                }
                else
                {
                    newQueue.push(tokObj);
                    if (tokObj.arity === 2)
                    {
                        let tok2= workStack.pop();
                        let tok1= workStack.pop();
                        workStack.push(tok1.concat(tok2));
                    }
                }
                break;
            }
        });

        // Pass 2: Promote operand subtypes to operands.
        return newQueue.map(function (tokObj)
        {
            if (tokObj.type === TOK_TYPE.OPERAND) return tokObj.subTokObj;
            return tokObj;
        });
    }

    function popStr(str)
    {
        const regex= new RegExp([
            "(\\\\[", opRegexStr, "]|[^", opRegexStr, "])+[\\s",
            opRegexStr, "]*$"
        ].join(""));

        return str.replace(regex, "");
    }

    // Convenience function for making a new Query.
    function queryWithTags(tagIds, autoexec, bmSort, bmSortDir, relTagSort,
                           relTagSortDir)
    {
        var query;

        query=
            emptyQuery(autoexec, bmSort, bmSortDir, relTagSort, relTagSortDir);
        query.initWithTags(tagIds);
        return query;
    }

    function registerQuery(query)
    {
        queries.push(query);
        if (!dbConn) initDBConn();
    }

    function relTagSQL(query)
    {
        var sql;

        if (query.isEmpty()) sql= relTagSQLEmpty();
        else sql= relTagSQLNonempty(query);

        if (!sql) return sql;
        return wrapRelTagSQL(query, sql);
    }

    function relTagSQLBMSearch(searchStr)
    {
        return [
            "SELECT tags.id AS tagid, bms.id AS bmid ",
            "FROM moz_bookmarks AS tags, moz_bookmarks AS bms ",
            "WHERE tags.parent = ",
                       BookmarkTags.Util.bmServ.tagsFolder, " AND ",
                  "bms.fk IN (", bmSQLSearch(searchStr), ") AND ",
                  "tags.id = bms.parent"
        ].join("");
    }

    function relTagSQLEmpty()
    {
        return [
            "SELECT tags.id AS tagid, bms.id AS bmid ",
            "FROM moz_bookmarks AS tags, moz_bookmarks AS bms ",
            "WHERE tags.parent = ",
                       BookmarkTags.Util.bmServ.tagsFolder, " AND ",
                  "tags.id = bms.parent"
        ].join("");
    }

    function relTagSQLNonempty(query)
    {
        if (query.isSimple()) return relTagSQLNonemptyOpt(query.tagIds());
        return sqlRelNonempty(query,
                              relTagSQLEmpty,
                              relTagSQLTag,
                              relTagSQLBMSearch);
    }

    function relTagSQLNonemptyOpt(tags)
    {
        var idStr;

        idStr= tags.join(",");
        return [
            "SELECT tags.id AS tagid, bms.id AS bmid ",
            "FROM moz_bookmarks AS tags, moz_bookmarks AS bms ",
            "WHERE tags.id NOT IN (", idStr, ") AND ",
                  "tags.parent = ",
                      BookmarkTags.Util.bmServ.tagsFolder, " AND ",
                  "bms.fk IN (SELECT fk FROM moz_bookmarks ",
                             "WHERE parent IN (", idStr, ") ",
                             "GROUP BY fk ",
                             "HAVING count(*) = ", tags.length, ") AND ",
                  "bms.parent = tags.id"
        ].join("");
    }

    function relTagSQLTag(tagId)
    {
        return [
            "SELECT tags.id AS tagid, bms.id AS bmid ",
            "FROM moz_bookmarks AS tags, moz_bookmarks AS bms ",
            "WHERE tags.id != ", tagId, " AND ",
                  "tags.parent = ",
                      BookmarkTags.Util.bmServ.tagsFolder, " AND ",
                  "bms.fk IN (SELECT fk ",
                             "FROM moz_bookmarks ",
                             "WHERE parent = ", tagId, ") AND ",
                  "tags.id = bms.parent"
        ].join("");
    }

    function removeQueryObserver(queryObsArr, obsObj)
    {
        var idx;

        idx= queryObsArr.indexOf(obsObj);
        if (idx < 0)
        {
            BookmarkTags.Util.logBug(
                "Tried to remove unregistered query observer");
            return;
        }
        delete queryObsArr[idx];
        queryObsArr.splice(idx, 1);
    }

    // Returns a parenthesized LIKE clause that can be stuck in a WHERE
    // expression.  searchStr is LIKE'd against bmTableName.title and
    // placesTableName.url, and the two LIKEs are ORed together.
    function sqlLikeClause(searchStr, bmTableName, placesTableName)
    {
        var escStr;

        searchStr=
            searchStr.
            replace(sqlLikeRegex, [sqlLikeEsc, "$&"].join("")).
            replace(sqlQuoteRegex, sqlQuoteEscaped);

        escStr= ["ESCAPE '", sqlLikeEsc, "'"].join("");

        return [
            "(", bmTableName, ".title LIKE '%", searchStr, "%' ", escStr, " ",
            "OR ", placesTableName, ".url LIKE '%", searchStr, "%' ", escStr,
            ")"
        ].join("");
    }

    // Computes query and returns the resulting SQL.  sqlRelEmpty
    // should be a function that returns SQL for the related tags of an
    // empty query.  sqlRelTag should be a funtion that returns SQL for the
    // related tags of a given tag; sqlRelTag will be passed the tag ID.
    // sqlLikeBM should be a function that returns SQL for the related tags
    // of a given search string; sqlLikeBM will be passed the string.
    function sqlRelNonempty(query, sqlRelEmpty, sqlRelTag, sqlLikeBM)
    {
        var workStack;
        var top;

        function doCompound(which)
        {
            var tok2;
            var tok1;

            tok2= workStack.pop();
            tok1= workStack.pop();
            if (tok1 && tok2)
            {
                workStack.push([
                    "SELECT DISTINCT * ",
                    "FROM (", tok1, " ", which, " ", tok2, ")"
                ].join(""));
            }
            else if (tok2) workStack.push(tok2);
        }

        workStack= [];
        query.queue.forEach(function (tokObj)
        {
            switch (tokObj.type)
            {
            case TOK_TYPE.OPERATOR:
                switch (tokObj)
                {
                case OP_TOK.INTERSECTION:
                    doCompound("INTERSECT");
                    break;
                case OP_TOK.UNION:
                    doCompound("UNION");
                    break;
                case OP_TOK.DIFFERENCE:
                    doCompound("EXCEPT");
                    break;
                case OP_TOK.COMPLEMENT:
                    top= workStack.pop();
                    if (top)
                    {
                        workStack.push([
                            "SELECT * ",
                            "FROM (", sqlRelEmpty(), " EXCEPT ", top, ")"
                        ].join(""));
                    }
                    break;
                }
                break;
            case TOK_TYPE.TAG:
                workStack.push(sqlRelTag(tokObj.id));
                break;
            case TOK_TYPE.BM_SEARCH:
                workStack.push(sqlLikeBM(tokObj.str));
                break;
            }
        });

        if (workStack.length > 0) return workStack[0];
        return null;
    }

    // Returns the suffix of str suitable for tag completion, if such a suffix
    // exists.
    function strTail(str)
    {
        var match;

        const regex= new RegExp([
            "(^|[^\\\\][", tagOpRegexStr, "]|^[", tagOpRegexStr, "])((\\\\[",
            opRegexStr, "]|[^", opRegexStr, "])*)$"
        ].join(""));

        match= regex.exec(str);
        if (match) return match[2];
        return null;
    }

    function tagSQL(query)
    {
        var idStr;

        idStr= query.tagIds().join(",");
        return [
            "SELECT id, title, ",
            // hack to force the template to sort the tags in the order they
            // appear in the tags array: in the string tags.join(",") + ","
            // replace row's tag ID with "0,"; then, template can sort in
            // lexicographical order
                   "replace('", idStr, ",', id || ',', '0,') AS sort ",
            "FROM moz_bookmarks ",
            "WHERE id IN (", idStr, ") ",
            "ORDER BY sort ASC"
        ].join("");
    }

    function unescapeOperators(str)
    {
        const regex= new RegExp(["\\\\([", opRegexStr, "])"].join(""), "g");
        return str.replace(regex, "$1");
    }

    function unregisterQuery(query)
    {
        var idx;

        idx= queries.indexOf(query);
        delete queries[idx];
        queries.splice(idx, 1);
        if (queries.length === 0) cleanupDBConn();
    }

    // Feed this SQL selecting all the moz_places.id's of the target bookmarks.
    function wrapBMSQL(query, sql)
    {
        // We GROUP BY bms.id to get all copies of a target bookmark with an
        // fk selected by sql.  See note in wrapRelTagSQL.
        //
        // (We used to group by t.id, but that gets only a single copy of each
        // bookmark.  Which copy it gets, if there's more than one, we can't
        // say.  That wasn't really a problem until I added the delete-bookmark
        // command.  Deleting the bookmark in the bookmark tree appeared not to
        // do anything.  Of course it deleted the corresponding copy in the
        // hierarchy -- the one with the ID we happened to select here -- but
        // that wasn't noticeable unless you were looking at the copy in the
        // Library.)
        return [
            "SELECT (CASE bms.title ISNULL ",
                    "WHEN 1 THEN moz_places.url ",
                    "ELSE (CASE bms.title ",
                          "WHEN '' THEN moz_places.url ",
                          "ELSE bms.title ",
                          "END) ",
                    "END) AS title, ",
                   "(CASE moz_places.favicon_id ISNULL ",
                    "WHEN 1 THEN '' ",
                    "ELSE (SELECT '", FAVICON_ANNO_PREFIX,
                              "' || moz_favicons.url ",
                          "FROM moz_favicons ",
                          "WHERE moz_favicons.id = moz_places.favicon_id) ",
                    "END) AS favicon, ",
                   "moz_places.url AS url, ",
                   "moz_places.visit_count AS visit_count, ",
                   "moz_places.frecency AS frecency, ",
                   "bms.id AS id, ",
                   "bms.dateAdded AS dateAdded, ",
                   "bms.lastModified AS lastModified, ",
                   "(SELECT max(visit_date) ",
                    "FROM moz_historyvisits ",
                    "WHERE place_id = moz_places.id) AS visit_date ",
            "FROM (", sql, ") AS t, ",
                 "moz_places, ",
                 "moz_bookmarks AS folders, ",
                 "moz_bookmarks AS bms ",
            "WHERE t.id = moz_places.id AND ",
                  "t.id = bms.fk AND ",
                  "bms.parent = folders.id AND ",
                  "folders.parent != ",
                      BookmarkTags.Util.bmServ.tagsFolder, " ",
            "GROUP BY bms.id ",
            "ORDER BY ", query.bmSort, " COLLATE NOCASE ", query.bmSortDir,
                     ", title COLLATE NOCASE ASC"
        ].join("");
    }

    // Feed this SQL selecting, for each target tag, [tagid, bmid].  There must
    // be a row for each bookmark association with tagid.  Both tagid and bmid
    // are moz_bookmarks.id's.
    function wrapRelTagSQL(query, sql)
    {
        // SELECTing count(*) here is not entirely accurate.  wrapBMSQL gets all
        // copies in the hierarchy (excluding tag folders) of a bookmark with
        // the same fk -- that is, bookmarks with different IDs but that
        // represent the same URI.  But all those copies are represented by only
        // one bookmark under a given tag folder, and here we're using tag
        // folders to get the related tags and their quantity (via the caller's
        // sql argument).  So, wrapBMSQL may return more bookmarks than
        // count(*) here indicates.
        //
        // Since bookmark copies are relatively rare, and because it's not
        // critical to report with 100% accuracy a tag's size, and because when
        // we are inaccurate we are likely not off by much, I think it's not
        // worth the performance hit to use more complex SQL here to be 100%
        // accurate.
        return [
            "SELECT tags.id AS id, ",
                   "tags.title AS title, ",
                   "tags.dateAdded AS dateAdded, ",
                   "tags.lastModified AS lastModified, ",
                   "count(*) AS relatedSize ",
            "FROM (", sql, ") AS t, moz_bookmarks AS tags ",
            "WHERE t.tagid = tags.id ",
            "GROUP BY id ",
            "ORDER BY ", query.relTagSort,
                          " COLLATE NOCASE ", query.relTagSortDir, ", ",
                     "title COLLATE NOCASE ASC"
        ].join("");
    }

    // If autoexec is falsy no SQL is executed at all, not on
    // construction, not on query modification, not on bookmark observer
    // callbacks, and the query doesn't need to be cleanup'ed.  SQL execution
    // can still be performed manually via the query's /execute*/ methods, and
    // even then the query doesn't need to be cleanup'ed.  Currently
    // query.autoexec must not be modified after construction, since on cleanup
    // the query uses that value to determine if it should remove itself as a
    // bookmark observer.  As an implementation note, it would be easy to
    // loosen that restriction later if need be.
    function Query(queue, autoexec, bmSort, bmSortDir, relTagSort,
                   relTagSortDir)
    {
        this.observers= [];
        this.bmObservers= [];
        this.relTagObservers= [];
        this.tagObservers= [];

        this.queue= fixQueue(queue);
        this.autoexec= !!autoexec;

        ensureSortPrefsValid();

        this.bmSort=
            bmSort ||
            BookmarkTags.Util.prefs.getCharPref("bookmarkSort");
        this.bmSortDir=
            bmSortDir ||
            BookmarkTags.Util.prefs.getCharPref("bookmarkSortDirection");

        this.relTagSort=
            relTagSort ||
            BookmarkTags.Util.prefs.getCharPref("tagSort");
        this.relTagSortDir=
            relTagSortDir ||
            BookmarkTags.Util.prefs.getCharPref("tagSortDirection");

        if (autoexec)
        {
            this.bmObserver=
                BookmarkTags.Util.makeBMObserver(makeBMObsCallback(this));
            this.tagObserver=
                BookmarkTags.Util.makeTagObserver(makeTagObsCallback(this));
            BookmarkTags.Util.bmServ.addObserver(this.bmObserver, false);
            BookmarkTags.Util.bmServ.addObserver(this.tagObserver, false);

            registerQuery(this);
            executeQuery(this);
        }
    }

    Query.prototype.
    addBMObserver= function (observerObj)
    {
        addQueryObserver(this.bmObservers, observerObj);
    };

    Query.prototype.
    addObserver= function (observerObj)
    {
        addQueryObserver(this.observers, observerObj);
    };

    Query.prototype.
    addRelTagObserver= function (observerObj)
    {
        addQueryObserver(this.relTagObservers, observerObj);
    };

    Query.prototype.
    addTagObserver= function (observerObj)
    {
        addQueryObserver(this.tagObservers, observerObj);
    };

    // Does a bookmark search on the query in an intuitive way.  Read the code.
    Query.prototype.
    bmSearch= function (searchStr)
    {
        var idx;
        var bmSearchTok;

        // find the final bookmark search token
        for (idx= this.queue.length - 1; idx >= 0; idx--)
        {
            if (this.queue[idx].type === TOK_TYPE.BM_SEARCH)
            {
                bmSearchTok= this.queue[idx];
                break;
            }
        }

        if (bmSearchTok)
        {
            // update the token with searchStr
            if (searchStr) bmSearchTok.str= searchStr;

            // if searchStr is empty, remove the token
            else
            {
                delete this.queue[idx];
                this.queue.splice(idx, 1);
                this.queue= fixQueue(this.queue);
            }
            executeQuery(this);
        }

        // intersect new token if searchStr is nonempty
        else if (searchStr) this.intersect(makeBMSearchTok(searchStr));
    };

    Query.prototype.
    cleanup= function ()
    {
        if (this.autoexec)
        {
            BookmarkTags.Util.bmServ.removeObserver(this.bmObserver);
            this.bmObserver.cleanup();
            this.bmObserver= null;
            BookmarkTags.Util.bmServ.removeObserver(this.tagObserver);
            this.tagObserver.cleanup();
            this.tagObserver= null;
            unregisterQuery(this);
        }
    };

    Query.prototype.
    clear= function ()
    {
        this.queue= [];
        executeQuery(this);
    };

    Query.prototype.
    clone= function (autoexec, bmSort, bmSortDir, relTagSort, relTagSortDir)
    {
        return new Query(this.queue,
                         autoexec,
                         bmSort || this.bmSort,
                         bmSortDir || this.bmSortDir,
                         relTagSort || this.relTagSort,
                         relTagSortDir || this.relTagSortDir);
    };

    Query.prototype.
    equals= function (query)
    {
        if (this.queue.length !== query.queue.length) return false;
        for (let i= 0; i < this.queue.length; i++)
        {
            let tok1= this.queue[i];
            let tok2= query.queue[i];
            if (tok1.type !== tok2.type) return false;
            switch (tok1.type)
            {
            case TOK_TYPE.OPERATOR:
                if (tok1 !== tok2) return false;
                break;
            case TOK_TYPE.TAG:
                if (tok1.id !== tok2.id) return false;
                break;
            case TOK_TYPE.BM_SEARCH:
                if (tok1.str.toLocaleLowerCase() !==
                    tok2.str.toLocaleLowerCase())
                {
                    return false;
                }
                break;
            }
        }
        return true;
    };

    Query.prototype.
    execute= function ()
    {
        forceExecute(this, executeQuery);
    };

    Query.prototype.
    executeBM= function ()
    {
        forceExecute(this, executeQueryBM);
    };

    Query.prototype.
    executeRelTag= function ()
    {
        forceExecute(this, executeQueryRelTag);
    };

    Query.prototype.
    executeTag= function ()
    {
        forceExecute(this, executeQueryTag);
    };

    Query.prototype.
    initWithTags= function (tagIds)
    {
        const that= this;

        this.queue= [];
        tagIds.forEach(function (tid) that.intersectTag(tid, null));
    };

    // Mutative.
    Query.prototype.
    intersect= function (token)
    {
        this.queue.push(token);
        if (this.queue.length >= 2) this.queue.push(OP_TOK.INTERSECTION);
        executeQuery(this);
    };

    // Intersects the tag represented by tagId, tagName with the query.
    // Mutative.
    Query.prototype.
    intersectTag= function (tagId, tagName)
    {
        this.intersect(makeTagTok(tagName, tagId));
    };

    Query.prototype.
    isEmpty= function ()
    {
        return this.queue.length === 0;
    };

    // The query is simple if it consists of only tags and, if more than one
    // tag, the only operators are intersections.
    Query.prototype.
    isSimple= function ()
    {
        for (let i= 0; i < this.queue.length; i++)
        {
            let tokObj= this.queue[i];
            switch (tokObj.type)
            {
            case TOK_TYPE.OPERATOR:
                if (tokObj !== OP_TOK.INTERSECTION) return false;
                break;
            case TOK_TYPE.BM_SEARCH:
                return false;
                break;
            }
        }
        return true;
    };

    Query.prototype.
    removeBMObserver= function (observerObj)
    {
        removeQueryObserver(this.bmObservers, observerObj);
    };

    Query.prototype.
    removeObserver= function (observerObj)
    {
        removeQueryObserver(this.observers, observerObj);
    };

    // Mutative.
    Query.prototype.
    removeOtherTags= function (tagId)
    {
        this.select(function (tagTok) tagTok.id === tagId);
    };

    Query.prototype.
    removeRelTagObserver= function (observerObj)
    {
        removeQueryObserver(this.relTagObservers, observerObj);
    };

    // Mutative.
    Query.prototype.
    removeSucceedingTags= function (tagId)
    {
        var found;

        found= false;
        this.select(function (tagTok)
        {
            let f= found;
            if (tagTok.id === tagId) found= true;
            return !f;
        });
    };

    // Mutative.
    Query.prototype.
    removeTag= function (tagId)
    {
        this.select(function (tagTok) tagTok.id !== tagId);
    };

    Query.prototype.
    removeTagObserver= function (observerObj)
    {
        removeQueryObserver(this.tagObservers, observerObj);
    };

    // Iterates over the query, retaining the tags for which callback returns
    // true and discarding the others.  callback is passed only tag tokens.
    // Mutative.
    Query.prototype.
    select= function (callback)
    {
        var newQueue;

        newQueue= [];
        for (let i= 0; i < this.queue.length; i++)
        {
            let tokObj= this.queue[i];
            if (tokObj.type === TOK_TYPE.TAG)
            {
                if (callback(tokObj)) newQueue.push(tokObj);
            }
            else newQueue.push(tokObj);
        }
        if (newQueue.length !== this.queue.length)
        {
            this.queue= fixQueue(newQueue);
            executeQuery(this);
        }
    };

    Query.prototype.
    setBMSort= function (sort, sortDir)
    {
        if (sort) this.bmSort= sort;
        if (sortDir) this.bmSortDir= sortDir;
        executeQueryBM(this);
    };

    Query.prototype.
    setRelTagSort= function (sort, sortDir)
    {
        if (sort) this.relTagSort= sort;
        if (sortDir) this.relTagSortDir= sortDir;
        executeQueryRelTag(this);
    };

    // Replaces the query with otherQuery.  Mutative, idempotent.
    Query.prototype.
    setTo= function (otherQuery)
    {
        if (!this.equals(otherQuery))
        {
            this.queue= otherQuery.queue.slice(0);
            executeQuery(this);
        }
    };

    // Returns the IDs of the tag tokens in the query.
    Query.prototype.
    tagIds= function ()
    {
        return this.tags().map(function (tt) tt.id);
    };

    // Returns the tag tokens in the query.
    Query.prototype.
    tags= function ()
    {
        return this.queue.filter(function (tok) tok.type === TOK_TYPE.TAG);
    };

    Query.prototype.
    toggleBMSortDir= function ()
    {
        if (this.bmSortDir === "ASC") this.setBMSort(null, "DESC");
        else this.setBMSort(null, "ASC");
    };

    Query.prototype.
    toggleRelTagSortDir= function ()
    {
        if (this.relTagSortDir === "ASC") this.setRelTagSort(null, "DESC");
        else this.setRelTagSort(null, "ASC");
    };

    // Returns a nice infix representation of the query.
    Query.prototype.
    toString= function ()
    {
        var workStack;
        var str;
        var tok1;
        var tok2;

        if (this.queue.length === 0) return "";

        workStack= [];
        this.queue.forEach(function (tokObj)
        {
            switch (tokObj.type)
            {
            case TOK_TYPE.TAG:
                workStack.push({ str: escapeOperators(tokObj.title) });
                break;
            case TOK_TYPE.BM_SEARCH:
                str= [
                    OP_TOK.BM_SEARCH.outputLexeme, escapeOperators(tokObj.str)
                ].join("");
                workStack.push({ str: str });
                break;
            case TOK_TYPE.OPERATOR:
                switch (tokObj.arity)
                {
                case 1:
                    tok1= workStack.pop();
                    if (tok1.tokObj)
                    {
                        str= [
                            tokObj.outputLexeme, OP_TOK.LPAREN.outputLexeme,
                            tok1.str, OP_TOK.RPAREN.outputLexeme
                        ].join("");
                    }
                    else str= [tokObj.outputLexeme, tok1.str].join("");
                    break;
                case 2:
                    tok2= workStack.pop();
                    tok1= workStack.pop();
                    if (tok1.tokObj && tok1.tokObj !== tokObj &&
                        tok1.tokObj.arity > 1)
                    {
                        str= [
                            OP_TOK.LPAREN.outputLexeme, tok1.str,
                            OP_TOK.RPAREN.outputLexeme
                        ].join("");
                    }
                    else str= tok1.str;
                    str += tokObj.outputLexeme;
                    if (tok2.tokObj && tok2.tokObj !== tokObj)
                    {
                        str += [
                            OP_TOK.LPAREN.outputLexeme, tok2.str,
                            OP_TOK.RPAREN.outputLexeme
                        ].join("");
                    }
                    else str += tok2.str;
                }
                workStack.push({ tokObj: tokObj, str: str });
                break;
            }
        });

        return workStack[0].str;
    };

    init();

    return {
        bmSQL:             bmSQL,
        emptyQuery:        emptyQuery,
        escapeOperators:   escapeOperators,
        parse:             parse,
        popStr:            popStr,
        queryWithTags:     queryWithTags,
        strTail:           strTail,
        unescapeOperators: unescapeOperators
    };
}();
