/* requries */
var fs = require("fs"),
    sys = require("sys"),
    wrench = require("./wrench"),
    jsdoctoolkit = require("./node-jsdoc-toolkit/app/nodemodule").jsdoctoolkit,
    uglify = require("./uglify-js").uglify,
    parser = require("./uglify-js").parser,
    cssmin = require("./lib/cssmin").cssmin,

/* options  */
    examplesLocation = "demos/examples",
    outputPath = "live",
    MINIFY = false,
    DEBUG = false,
    jQueryCDN = "http://ajax.googleapis.com/ajax/libs/jquery/1.6.2/jquery.min.js",

/* globals  */
    rowSeparator = /[\r\n]+\s+/,
    isLive = /<script[^>]*?>\s*var\slive\s*=\s*false;*\s*<\/script>\s+/im,
    baseRegions = {},
    regionRegex = {
        description: getRegionRegex("description"),
        script: getRegionRegex("script"),
        css: getRegionRegex("css"),
        helpTabs: getRegionRegex("help-tabs"),
        helpData: getRegionRegex("help-data"),
        configuration: getRegionRegex("configuration"),
        properties: getRegionRegex("properties"),
        methods: getRegionRegex("methods"),
        events: getRegionRegex("events")
    };

function getRegionRegex(regionName) {
    return new RegExp("\\s*<!--\\s*" + regionName + "\\s*-->(([\\r\\n]|.)*?)<!--\\s*" + regionName + "\\s*-->", "im");
}

function removeDuplicateResources(resource, target) {
    var scriptTag = resource.replace(/(\.\.\/)+/g, "[\.\/]*").replace(/\//g, "\\/").replace(/\./g, "\\."),
        rex = new RegExp("[\\r\\n]+\\s+" + scriptTag, "i");

    return target.replace(rex, "");
}

function splitScriptRegion(exampleHTML, base) {
    var baseScripts = baseRegions.script.html,
        scriptMatches = regionRegex.script.exec(exampleHTML),
        currentPageScripts = scriptMatches ? scriptMatches[1].trimLeft() : "",
        scriptStripper1 = /"(.*?)src/g,
        scriptStripper2 = /src="([.\/]*)([^"]*)([^\.min]*)\.js"/g,
        jsExtension = MINIFY ? ".min.js" : ".js",
        rebaser = function (match, g1, g2) {
            return 'src="' + ( (g1 != "./") ? base : g1 ) + g2 + jsExtension + '"';
        };

    if (!currentPageScripts)
        return false;

    currentPageScripts.trim().split(rowSeparator).forEach(function(item) {
        baseScripts = removeDuplicateResources(item, baseScripts);
    });

    currentPageScripts = currentPageScripts.replace(scriptStripper1, '"js');
    currentPageScripts = currentPageScripts.replace(scriptStripper2, rebaser);
    baseScripts = baseScripts.replace(scriptStripper1, '"js');
    baseScripts = baseScripts.replace(scriptStripper2, rebaser);

    if (MINIFY) {
        currentPageScripts = currentPageScripts.replace(/(..\/)*js\/jquery\.min\.js/g, jQueryCDN);
    }

    return currentPageScripts + baseScripts;
}

function splitCSSRegion(exampleHTML, base) {
    var baseCSS = baseRegions.css.html,
        cssMatches = regionRegex.css.exec(exampleHTML),
        currentPageCSS = cssMatches ? cssMatches[1].trimLeft() : "",
        cssStripper = /href="[.\/]*([^"]*)\.css"/g,
        cssExtension = MINIFY ? ".min.css" : ".css",
        rebasedHref = 'href="' + base + '$1' + cssExtension + '"';

    if (!currentPageCSS)
        return false;

    currentPageCSS.trim().split(rowSeparator).forEach(function(item) {
        baseCSS = removeDuplicateResources(item, baseCSS);
    });

    currentPageCSS = currentPageCSS.replace(cssStripper, rebasedHref);
    baseCSS = baseCSS.replace(cssStripper, rebasedHref);

    return currentPageCSS + baseCSS;
}

function updateBaseLocation(html, base) {
    return html.replace(/href="([^"]*)"/g, 'href="' + base + '$1"');
}

function componentFromFilename(file) {
    var candidate = file.split("/").filter(function(val) {
            return val != outputPath && !/\.html$/i.test(val);
        })[0];

    if (candidate == "overview" || candidate === undefined) {
        return;
    }

    return candidate;
}

function importComponentHelp(exampleHTML, component) {
    if (!component)
        return exampleHTML;

    var helpFiles = {
        "templates": "kendo.Template",
        "datasource": "kendo.data.DataSource",
        "dragdrop": "kendo.ui.Draggable",
        "animation": "kendo.Animation"
    };

    // merge documentation for multiple components
    var relatedComponents = {
        "slider": ["slider", "rangeslider"]
    }[component];

    function helpFileFor(component) {
        var result = "";

        try {
            var helpSymbol = (helpFiles[component] || "kendo.ui." + component),
                helpFile = "docs/symbols/" + helpSymbol + ".html",

            result = fs.readFileSync(helpFile, "utf8");
        } catch (e) {
            // file does not exist.
        }

        return result;
    }

    var description = "", tabs = "", data = "",
        configuration = "", methods = "", events = "";


    function getRegion(regionName) {
        var matches = regionRegex[regionName].exec(helpHTML);

        if (matches) {
            return matches[1];
        }

        return "None";
    }

    function formatComponentRegion(component, region, expanded) {
        return '<div class="detailHandle' + (expanded ? ' detailHandleExpanded' : '') + '">' +
                    '<div class="' + (expanded ? 'detailExpanded' : 'detailCollapsed') + '"></div>' + component +
                '</div>' +
                '<div class="detailBody"' + (expanded ? ' style="display:block;"' : '') + '>' + region + '</div>';
    }

    if (relatedComponents) {
        for (var c in relatedComponents) {
            helpHTML = helpFileFor(relatedComponents[c]);

            description = description || getRegion("description");
            tabs = tabs || getRegion("helpTabs");

            configuration += formatComponentRegion(relatedComponents[c], getRegion("configuration"), c == 0);
            methods += formatComponentRegion(relatedComponents[c], getRegion("methods"), c == 0);
            events += formatComponentRegion(relatedComponents[c], getRegion("events"), c == 0);
        }

        data = '<div class="optionsContainer">' + configuration + '</div>' +
               '<div class="methodsContainer">' + methods + '</div>' +
               '<div class="eventsContainer">' + events + '</div>';

        if (relatedComponents.length > 1) {
            // remove stats from tabs
            tabs = tabs.replace(/\s+\([\s\d]+\)/g, "");
        }
    } else {
        helpHTML = helpFileFor(component);

        description = getRegion("description");
        tabs = getRegion("helpTabs");
        data = getRegion("helpData");
    }

    // could be improved if example has appropriate markers, or better yet, if loaded through AJAX (and not importing at all)
    if (description) {
        exampleHTML = exampleHTML.replace(regionRegex.description, "<!-- description -->" + description + "<!-- description -->");
    }

    exampleHTML = exampleHTML.replace(regionRegex.helpTabs, "<!-- help-tabs -->" + tabs + "<!-- help-tabs -->");
    exampleHTML = exampleHTML.replace(regionRegex.helpData, "<!-- help-data -->" + data + "<!-- help-data -->");

    return exampleHTML;
}

function processExample(file) {
    var exampleHTML = fs.readFileSync(file, "utf8"),
        base = file === outputPath + "/index.html" ? "" : "../",
        scriptRegion = splitScriptRegion(exampleHTML, base),
        cssRegion = splitCSSRegion(exampleHTML, base),
        component = componentFromFilename(file);

    exampleHTML = baseRegions.meta.exec(exampleHTML, baseRegions.meta.html);

    exampleHTML = baseRegions.script.exec(exampleHTML, scriptRegion);

    exampleHTML = baseRegions.css.exec(exampleHTML, cssRegion);

    exampleHTML = baseRegions.nav.exec(exampleHTML, updateBaseLocation(baseRegions.nav.html, base));

    var description = regionRegex.description.exec(exampleHTML);
    exampleHTML = exampleHTML.replace(regionRegex.description, '');

    if (description) {
        exampleHTML = baseRegions.tools.exec(exampleHTML, baseRegions.tools.html.replace(regionRegex.description, description[0]));
    } else {
        // overview has no description
        exampleHTML = baseRegions.tools.exec(exampleHTML);
    }

    exampleHTML = importComponentHelp(exampleHTML, component);

    fs.writeFileSync(file, exampleHTML, "utf8");
}

function processExamplesDirectory(dir) {
    var children = fs.readdirSync(dir);

    for (var i = 0; i < children.length; i++) {
        var name = dir + "/" + children[i];
        var stat = fs.statSync(name);

        if (!stat.isFile()) {
            processExamplesDirectory(name);
        } else if (/\.html$/.test(name)) {
            processExample(name);
        }
    }
}

function copyResources(source, destination, processCallback) {
    processCallback = processCallback || function(data) { return data; };

    fs.readdirSync(source)
        .forEach(function(file) {
            var data = fs.readFileSync(source + file, "utf8");

            data = processCallback(data);

            if (MINIFY) {
                file = file.replace(/\.(css|js)$/, ".min.$1");
            }

            fs.writeFileSync(destination + file, data, "utf8");
        });
}

exports.build = function(origin, destination, minify) {
    MINIFY = minify;

    if (destination) {
        outputPath = destination;
    }

    try {
        fs.statSync(outputPath)
    } catch(e) {
        fs.mkdirSync(outputPath, fs.statSync("./").mode);
    }

    var originJS = "src",
        originStyles = "styles";

    if (origin) {
        originJS = origin + "/js";
        originStyles = origin + "/styles";
    }

    console.log("Parsing master page...");
    var indexHtml = fs.readFileSync(examplesLocation + "/index.html", "utf8");

    "nav,script,tools,css,meta".split(",").forEach(function(region) {
        var re = new RegExp("<!--\\s*" + region + "\\s*-->([\\u000a\\u000d\\u2028\\u2029]|.)*<!--\\s*" + region + "\\s*-->", "ig");
        var html = re.exec(indexHtml)[0].trim();

        baseRegions[region] = {
            rex: re,
            html: html,
            exec: function(data, value) {
                value = value || html;

                return data.replace(re, value);
            }
        };
    });

    console.log("Copying resources...");
    wrench.copyDirSyncRecursive(examplesLocation, outputPath);
    wrench.copyDirSyncRecursive(originJS, outputPath + "/js");
    wrench.copyDirSyncRecursive(originStyles, outputPath + "/styles");
    fs.writeFileSync(outputPath + "/index.html", indexHtml.replace(isLive, ""), "utf8");
    fs.writeFileSync(outputPath + "/js/jquery.tmpl.js", fs.readFileSync("src/jquery.tmpl.js", "utf8"), "utf8");
    fs.unlinkSync(outputPath + "/template.html");

    if (!MINIFY) {
        fs.writeFileSync(outputPath + "/js/jquery.js", fs.readFileSync("src/jquery.js", "utf8"), "utf8");
    } else {
        fs.writeFileSync(outputPath + "/web.config", fs.readFileSync("web.config", "utf8"), "utf8");
    }

    copyResources(
        examplesLocation + "/styles/",
        outputPath + "/styles/",
        function(data) {
            if (MINIFY) {
                data = cssmin(data);
            }

            return data;
        });

    copyResources(
        examplesLocation + "/js/",
        outputPath + "/js/",
        function(data) {
            if (MINIFY) {
                var ast = parser.parse(data);
                ast = uglify.ast_mangle(ast);
                ast = uglify.ast_squeeze(ast);
                data = uglify.gen_code(ast);
            }

            return data;
        });

    console.log("Building documentation...");
    jsdoctoolkit.run(["-c=build/docs.conf"]);

    console.log("Processing examples...");
    processExamplesDirectory(outputPath);
};
