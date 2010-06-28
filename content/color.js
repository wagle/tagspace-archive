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

// This nastiness is needed so our XPCOM component can access the objects here.
var EXPORTED_SYMBOLS= ["BookmarkTagsColor"];


var BookmarkTagsColor= function ()
{
    function hexStrToRGB(str)
    {
        return {
            r: parseInt(str.substr(1, 2), 16) / 255,
            g: parseInt(str.substr(3, 2), 16) / 255,
            b: parseInt(str.substr(5, 2), 16) / 255
        };
    }

    function hslToRGB(hsl)
    {
        var q;
        var p;
        var hk;
        var tc;
        var rgb;

        if (hsl.l < 0.5) q= hsl.l * (1 + hsl.s);
        else q= hsl.l + hsl.s - (hsl.l * hsl.s);

        p= (2 * hsl.l) - q;

        hk= hsl.h / 360;

        tc= { r: hk + (1 / 3), g: hk, b: hk - (1 / 3) };
        for (let k in tc)
        {
            if (tc[k] < 0) tc[k]= tc[k] + 1;
            if (tc[k] > 1) tc[k]= tc[k] - 1;
        }

        rgb= { r: 0, g: 0, b: 0 };
        for (let k in rgb)
        {
            if (tc[k] < (1 / 6)) rgb[k]= p + ((q - p) * 6 * tc[k]);
            else if ((1 / 6) <= tc[k] && tc[k] < 0.5) rgb[k]= q;
            else if (0.5 <= tc[k] && tc[k] < (2 / 3))
            {
                rgb[k]= p + ((q - p) * 6 * ((2 / 3) - tc[k]));
            }
            else rgb[k]= p;
        }

        return rgb;
    }

    function luminance(rgb)
    {
        return (0.2126 * rgb.r) + (0.7152 * rgb.g) + (0.0722 * rgb.b);
    }

    function rgbToHexStr(rgb)
    {
        var strs;

        strs= { r: null, g: null, b: null };
        for (let k in strs)
        {
            strs[k]= Math.round(rgb[k] * 255).toString(16);
            if (strs[k].length === 1) strs[k]= "0" + strs[k];
        }
        return ["#", strs.r, strs.g, strs.b].join("");
    }

    function rgbToHSL(rgb)
    {
        var max;
        var min;
        var hsl;

        max= 0;
        min= 1;
        for (let k in rgb)
        {
            if (rgb[k] > max) max= rgb[k];
            if (rgb[k] < min) min= rgb[k];
        }

        hsl= {};

        hsl.l= (max + min) / 2;

        if (max === min) hsl.h= 0;
        else if (max === rgb.r && rgb.g >= rgb.b)
        {
            hsl.h= 60 * ((rgb.g - rgb.b) / (max - min));
        }
        else if (max === rgb.r && rgb.g < rgb.b)
        {
            hsl.h= 60 * ((rgb.g - rgb.b) / (max - min)) + 360;
        }
        else if (max === rgb.g)
        {
            hsl.h= 60 * ((rgb.b - rgb.r) / (max - min)) + 120;
        }
        else if (max === rgb.b)
        {
            hsl.h= 60 * ((rgb.r - rgb.g) / (max - min)) + 240;
        }

        if (max === min) hsl.s= 0;
        else if (hsl.l <= 0.5) hsl.s= (max - min) / (2 * hsl.l);
        else hsl.s= (max - min) / (2 - (2 * hsl.l));

        return hsl;
    }

    return {
        hexStrToRGB: hexStrToRGB,
        hslToRGB:    hslToRGB,
        luminance:   luminance,
        rgbToHexStr: rgbToHexStr,
        rgbToHSL:    rgbToHSL
    };
}();

if (typeof(BookmarkTags) !== "undefined") BookmarkTags.Color= BookmarkTagsColor;
