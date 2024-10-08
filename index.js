/**
 * Author: Javi Bonafonte
 *
 * TODO:
 * - More forms... Minior, Necorzma, Magearma
 * - Missing shinies: Yungoos, Castform forms (pokemonshowdown)
 */

$(document).ready(Main);

// global constants and variables

// whether user has touch screen
let has_touch_screen = false;
if ("maxTouchPoints" in navigator) {
    has_touch_screen = navigator.maxTouchPoints > 0;
} else if ("msMaxTouchPoints" in navigator) {
    has_touch_screen = navigator.msMaxTouchPoints > 0;
} else {
    let mq = window.matchMedia && matchMedia("(pointer:coarse)");
    if (mq && mq.media === "(pointer:coarse)") {
        has_touch_screen = !!mq.matches;
    } else if ('orientation' in window) {
        has_touch_screen = true; // deprecated, but good fallback
    } else {
        // Only as a last resort, fall back to user agent sniffing
        let UA = navigator.userAgent;
        has_touch_screen = (
            /\b(BlackBerry|webOS|iPhone|IEMobile)\b/i.test(UA) ||
            /\b(Android|Windows Phone|iPad|iPod)\b/i.test(UA)
        );
    }
}

const JB_URL = "https://raw.githubusercontent.com/javi-b/pokemon-resources/main/";
const GIFS_URL = JB_URL + "graphics/ani/";
const SHINY_GIFS_URL = JB_URL + "graphics/ani-shiny/";
const POGO_PNGS_URL = JB_URL + "graphics/pogo-256/"
const SHINY_POGO_PNGS_URL = JB_URL + "graphics/pogo-shiny-256/"
const ICONS_URL = JB_URL + "graphics/pokemonicons-sheet.png";

const LOADING_MAX_VAL = 5; // max number of files that need to be loaded
let loading_val = 0; // number of files loaded so far
let finished_loading = false; // whether page finished loading all files

// jb json objects
let jb_names, jb_mega, jb_pkm, jb_max_id, jb_fm, jb_cm;

// settings constants and variables
const METRICS = new Set();
METRICS.add("ER");
METRICS.add("EER");
METRICS.add("TER");
let settings_metric = "EER";
let settings_raid_system = "new";
let settings_default_level = 40;

// global variables

// FIXME these are not ideal, would be better that, if a new pokemon is loaded,
//        whatever asynchronous operations were being done on the previous mon
//        should be cancelled

// whether pokemon go table moves are currently being loaded asynchronously
let loading_pogo_moves = false;
// whether pokemon go counters are currently being loaded asynchronously
let loading_counters = false;

// search input selected suggestion index
let selected_suggestion_i = -1;

let current_jb_pkm_obj = null; // current pokemon's jb_pkm_obj
let current_mega = false; // whether current pokemon is a mega
let current_mega_y = false; // whether current pokemon is a mega y

// whether counters of current pokemon have been loaded yet
let counters_loaded = false;

/**
 * Main function.
 */
function Main() {

    $(document).click(function(event) { OnDocumentClick(event); });

    $("#input").bind("keydown", OnInputKeyDown);
    $("#input").bind("keyup", OnInputKeyUp);
    $("#input").bind("focus", OnInputFocus);
    $("#input").bind("blur", OnInputBlur);

    $("#input").focus();

    // jb
    HttpGetAsync(JB_URL + "pokemon_names.json",
        function(response) { jb_names = JSON.parse(response); });
    HttpGetAsync(JB_URL + "mega_pokemon.json",
        function(response) { jb_mega = JSON.parse(response); });
    HttpGetAsync(JB_URL + "pogo_pkm.json",
        function(response) {
            jb_pkm = JSON.parse(response);
            jb_max_id = jb_pkm.at(-1).id;
        });
    HttpGetAsync(JB_URL + "pogo_fm.json",
        function(response) { jb_fm = JSON.parse(response); });
    HttpGetAsync(JB_URL + "pogo_cm.json",
        function(response) { jb_cm = JSON.parse(response); });

    // event handlers

    // when going back or forward in the browser history
    window.onpopstate = function() { CheckURLAndAct(); }

    $("#settings-hide").click(SwapSettingsStatus);
    $("#metric-er").click(function() { SetMetric("ER"); });
    $("#metric-eer").click(function() { SetMetric("EER"); });
    $("#metric-ter").click(function() { SetMetric("TER"); });
    $("#raid-system-old").click(function() { SetRaidSystem("old"); });
    $("#raid-system-new").click(function() { SetRaidSystem("new"); });
    $("#lvl-40").click(function() { SetDefaultLevel(40); });
    $("#lvl-50").click(function() { SetDefaultLevel(50); });

    $("#note-icon").click(function() { ToggleNote(); });
    $("#note-title").click(function() { ToggleNote(); });

    $("#stats-form").submit(function(e) {
        UpdatePokemonStatsAndURL();
        return false;
    });

    $("#counters :checkbox").change(function() {
        if (current_jb_pkm_obj) {
            ResetPokemongoCounters(current_jb_pkm_obj);
            LoadPokemongoCounters(current_jb_pkm_obj, current_mega, current_mega_y);
        }
    });

    $("#strongest-link").click(function() {
        LoadStrongestAndUpdateURL();
        return false;
    });

    $("#strongest :checkbox").change(function() {
        //LoadStrongest();
        CheckURLAndAct();
    });
}

/**
 * Local asynchronous GET request.
 */
function LocalGetAsync(url, callback) {

    $.ajax({
        type: "GET",
        url: url,
        dataType: "text",
        success: callback
    });
}

/**
 * Asynchronous HTTP GET request to a specific url and with a specific
 * callback function.
 */
function HttpGetAsync(url, callback) {

    let xml_http = new XMLHttpRequest();
    xml_http.onreadystatechange = function() { 
        if (xml_http.readyState == 4 && xml_http.status == 200) {
            callback(xml_http.response);
            IncreaseLoadingVal();
        }
    }
    xml_http.open("GET", url, true); // true for asynchronous 
    xml_http.send(null);
}

/**
 * Increases value that represents number of files loaded so far
 * and updates its html loading bar on the page.
 */
function IncreaseLoadingVal() {

    loading_val++;
    let pct = 100 * loading_val / LOADING_MAX_VAL;
    $("#loading-bar").css("width", pct + "%");

    // if finished loading...
    if (pct >= 100) {
        finished_loading = true;
        setTimeout(function() {
            $("#loading-bar").css("display", "none");
        }, 100);
        CheckURLAndAct();
    }
}

/**
 * Document's general click callback.
 */
function OnDocumentClick(event)  {

    // function only used on touch screen devices
    if (!has_touch_screen)
        return;

    let target = $(event.target);

    // if not clicking the counters rating pct or the counters popup...
    if (!$(target).closest("#counters-popup").length
            && !$(target).closest(".counter-rat-pct").length) {
        // hides the counters popup if visible
        if ($("#counter-popup").css("display") != "none")
            ShowCountersPopup(this, false);
        // removes rat pcts borders
        let rat_pcts = $(".counter-rat-pct > a");
        for (rat_pct of rat_pcts)
            $(rat_pct).css("border", "none");
    }
}

/**
 * Swaps whether the settings list is being displayed or not.
 */
function SwapSettingsStatus() {

    const list = $("#settings-list");

    if (list.css("display") == "none") {
        list.css("display", "initial");
        $(this).text("[hide]");
    } else {
        list.css("display", "none");
        $(this).text("[show]");
    }
}

/**
 * Sets the metric setting and, if necessary, updates the page accordingly.
 */
function SetMetric(metric) {

    if (!METRICS.has(metric) || metric == settings_metric)
        return;

    // sets global variable
    settings_metric = metric;

    // sets settings options selected class
    $("#metric-er").removeClass("settings-opt-sel");
    $("#metric-eer").removeClass("settings-opt-sel");
    $("#metric-ter").removeClass("settings-opt-sel");
    switch (settings_metric) {
        case "ER":
            $("#metric-er").addClass("settings-opt-sel");
            break;
        case "EER":
            $("#metric-eer").addClass("settings-opt-sel");
            break;
        case "TER":
            $("#metric-ter").addClass("settings-opt-sel");
            break;
    }

    // sets pokemongo table header
    $("#table-metric-header").html(settings_metric);
    $("#table-metric-header-sh").html(settings_metric + "<br>(Shadow)");

    // reload page
    CheckURLAndAct();
}

/**
 * Sets the raid system setting and, if necessary, updates the page accordingly.
 */
function SetRaidSystem(raid_system) {

    if (raid_system != "old" && raid_system != "new")
        return;

    // sets global variable
    settings_raid_system = raid_system;

    // sets settings options selected class
    $("#raid-system-old").removeClass("settings-opt-sel");
    $("#raid-system-new").removeClass("settings-opt-sel");
    switch (raid_system) {
        case "old":
            $("#raid-system-old").addClass("settings-opt-sel");
            break;
        case "new":
            $("#raid-system-new").addClass("settings-opt-sel");
            break;
    }

    // reload page
    CheckURLAndAct();
}

/**
 * Sets the default level setting and, if necessary, updates the page accordingly.
 */
function SetDefaultLevel(level) {

    if (level != 40 && level != 50)
        return;

    // sets global variable
    settings_default_level = level;

    // sets settings options selected class
    $("#lvl-40").removeClass("settings-opt-sel");
    $("#lvl-50").removeClass("settings-opt-sel");
    switch (level) {
        case 40:
            $("#lvl-40").addClass("settings-opt-sel");
            break;
        case 50:
            $("#lvl-50").addClass("settings-opt-sel");
            break;
    }

    // reload page
    CheckURLAndAct();
}

/**
 * Toggles the note body's visibility.
 */
function ToggleNote() {

    let note_body = $("#note-body");

    if (note_body.css("display") == "none")
        note_body.css("display", "block");
    else
        note_body.css("display", "none");
}

/**
 * Callback function for KeyDown event in search input box.
 */
function OnInputKeyDown(e) {

    let selected_suggestion_changed = false;

    switch (e.keyCode) {

        case 9: // tab
            e.preventDefault();
            break;

        case 13: // enter
            e.preventDefault();
            if (selected_suggestion_i > -1) {
                const selected_text = $("#suggestions").children()
                        .eq(selected_suggestion_i)[0].textContent;
                const name =
                    selected_text.slice(selected_text.indexOf(" "));
                LoadPokemonAndUpdateURL(Clean(name));
            } else {
                LoadPokemonAndUpdateURL(Clean($("#input").val()));
            }
            break;

        case 38: // arrow up
            e.preventDefault();
            selected_suggestion_i--;
            selected_suggestion_changed = true;
            break;

        case 40: // arrow down
            e.preventDefault();
            selected_suggestion_i++;
            selected_suggestion_changed = true;
            break;
    }

    if (selected_suggestion_changed)
        UpdateSelectedSuggestion();
}

/**
 * Callback function for KeyUp event in search input box.
 */
function OnInputKeyUp(e) {

    if (e.keyCode == 38 || e.keyCode == 40)
        return;

    UpdateInputSuggestions();
}

/**
 * Callback function for Focus event in search input box.
 */
function OnInputFocus(e) {

    UpdateInputSuggestions();
}

/**
 * Callback function for Blur event in search input box.
 * The Blur event fires when an element has lost focus.
 */
function OnInputBlur(e) {

    let suggestions = $("#suggestions");

    // empties suggestions
    suggestions.empty();

    // sets borders
    suggestions.css("border", "none");
    suggestions.css("border-top", "1px solid var(--col-off)");
}

/**
 * Updates the search input suggestions.
 */
function UpdateInputSuggestions() {

    // checks whether json object is available
    if (!jb_names)
        return;

    selected_suggestion_i = -1;

    const input = $("#input").val();
    const clean_input = input.toLowerCase();
    const input_len = clean_input.length;
    let suggestions = $("#suggestions");

    suggestions.empty();

    if (input_len > 0) {

        const jb_names_key = Object.keys(jb_names);
        for (key of jb_names_key) {

            const entry = jb_names[key];

            if (entry.id > jb_max_id)
                continue;

            // whether input starts with a pokemon id
            const same_id = (String(entry.id).startsWith(clean_input));

            // whether input starts with a pokemon '#' + id
            const hash_id = "#" + String(entry.id);
            const same_hash_id = (hash_id.startsWith(clean_input));

            // whether input starts with a pokemon name
            const same_name =
                (entry.name.toLowerCase().startsWith(clean_input));

            // if the input matches any possible start...
            if (same_id || same_hash_id || same_name ) {

                // index of suggestion currently being added
                const sug_i = suggestions.children().length;

                let sug_p = $("<p></p>");
                sug_p.mouseover(function () {
                    selected_suggestion_i = sug_i;
                    UpdateSelectedSuggestion();
                });
                sug_p.mousedown(function () {
                    LoadPokemonAndUpdateURL(entry.id);
                });
            
                if (same_id) {
                    sug_p.html("#<b>" + clean_input + "</b>"
                            + String(entry.id).slice(input_len)
                            + " " + entry.name);

                } else if (same_hash_id) {
                    sug_p.html("<b>" + clean_input + "</b>"
                            + hash_id.slice(input_len) + " " + entry.name);

                } else if (same_name) {
                    sug_p.html("#" + entry.id + " <b>" + input + "</b>"
                            + entry.name.slice(input_len));
                }

                suggestions.append(sug_p);
                if (suggestions.children().length >= 10)
                    break;
            }
        }

        // sets borders
        if (suggestions.children().length > 0) {
            suggestions.css("border", "1px solid var(--col-off)");
        } else {
            suggestions.css("border", "none");
            suggestions.css("border-top", "1px solid var(--col-off)");
        }

    } else {

        // sets borders
        suggestions.css("border", "none");
        suggestions.css("border-top", "1px solid var(--col-off)");
    }
}

/**
 * Updates which suggestion is currently selected according to
 * the global variable 'selected_suggestion_i'.
 */
function UpdateSelectedSuggestion() {

    const suggestions = $("#suggestions").children();

    if (selected_suggestion_i < -1)
        selected_suggestion_i = -1;
    if (selected_suggestion_i >= suggestions.length)
        selected_suggestion_i = suggestions.length - 1;

    for (let i = 0; i < suggestions.length; i++) {
        if (i == selected_suggestion_i)
            suggestions.eq(i).addClass("selected-suggestion");
        else
            suggestions.eq(i).removeClass("selected-suggestion");
    }
}

/**
 * Checks whether the current url contains search parameters that dictate
 * what to do. If it finds something, it does it.
 */
function CheckURLAndAct() {

    const params = new URLSearchParams(location.search);

    // if url has pokemon params...
    if (params.has("p")) {

        const pkm = params.get("p");

        let form = "def";
        if (params.has("f"))
            form = params.get("f");

        let mega = false;
        if (params.has("m"))
            mega = true;

        let mega_y = false;
        if (params.has("y"))
            mega_y = true;

        let level = null;
        if (params.has("lvl"))
            level = Number(params.get("lvl"));

        let ivs = null;
        if (params.has("ivs")) {
            let ivs_str = params.get("ivs");
            ivs = {
                atk: parseInt(ivs_str.slice(0, 2)),
                def: parseInt(ivs_str.slice(2, 4)),
                hp: parseInt(ivs_str.slice(4, 6))
            };
            function IsValidIV(val) {
                return (Number.isInteger(val) && val >= 0 && val <= 15);
            }
            if (!IsValidIV(ivs.atk) || !IsValidIV(ivs.def)
                    || !IsValidIV(ivs.hp)) {
                ivs = null;
            }
        }

        // loads pokemon
        LoadPokemon(pkm, form, mega, mega_y, level, ivs);

        return;
    }

    // if url has 'strongest' param...
    if (params.has("strongest")) {

        // if url has 't' param...
        if (params.has("t")) {

            // sets type to 't' value with first char as upper and rest as lower
            let type = params.get("t");
            type = type.charAt(0).toUpperCase()
                + type.slice(1).toLowerCase();

            if (type == 'Each')
                LoadStrongest("each");
            else if (type == "Any")
                LoadStrongest("any");
            else if (POKEMON_TYPES.has(type))
                LoadStrongest(type);

            return;
        }

        // loads strongest (default)
        LoadStrongest();

        return;
    }
}

/**
 * Calls the 'LoadPokemon' function and updates the url to match the
 * pokemon being loaded.
 */
function LoadPokemonAndUpdateURL(clean_input, form = "def", mega = false,
        mega_y = false, level = null, ivs = null) {

    if (!finished_loading || loading_pogo_moves || loading_counters)
        return false;

    LoadPokemon(clean_input, form, mega, mega_y, level, ivs);

    let url = "?p=" + clean_input;

    if (form != "def")
        url += "&f=" + form;
    if (mega)
        url += "&m";
    if (mega_y)
        url += "&y";
    if (level)
        url += "&lvl=" + String(level);
    if (ivs) {
        url += "&ivs="
            + String(ivs.atk).padStart(2, "0")
            + String(ivs.def).padStart(2, "0")
            + String(ivs.hp).padStart(2, "0");
    }

    window.history.pushState({}, "", url);

    return false;
}

/**
 * Loads a pokemon page.
 */
function LoadPokemon(clean_input, form = "def", mega = false,
        mega_y = false, level = null, ivs = null) {

    if (!finished_loading || loading_pogo_moves || loading_counters)
        return;

    // gets the pokemon id from the input and returns if it doesn't find it
    const pokemon_id = GetPokemonId(clean_input);
    if (pokemon_id == 0)
        return;

    // sets the page title
    const pokemon_name = jb_names[pokemon_id].name;
    document.title = "#" + pokemon_id + " " + pokemon_name
            + " - Palkiadex";

    // sets the default form
    if (form == "def")
        form = GetPokemonDefaultForm(pokemon_id);

    // sets the default level
    if (level == null)
        level = settings_default_level;
    
    // sets level input value
    $("#input-lvl").val(level);

    // sets the default ivs
    if (ivs == null)
        ivs = { atk: 15, def: 15, hp: 15 };

    // sets ivs inputs values
    $("#input-atk").val(ivs.atk);
    $("#input-def").val(ivs.def);
    $("#input-hp").val(ivs.hp);

    // empties the input
    $("#input").val("");

    // empties the pokemon containers
    $("#main-container").empty();
    $("#previous-containers").empty();
    $("#next-containers").empty();
    $("#additional-containers").empty();

    const forms = GetPokemonForms(pokemon_id);
    const def_form = forms[0];

    // sets main pokemon container
    $("#main-container").append(GetPokemonContainer(pokemon_id,
            (form == def_form && !mega), def_form));

    // sets previous and next pokemon containers
    for (i = 1; i <= 2; i++) {
        const prev_pokemon_id = parseInt(pokemon_id) - i;
        if (prev_pokemon_id > 0) {
            $("#previous-containers").prepend(
                GetPokemonContainer(prev_pokemon_id, false,
                    GetPokemonDefaultForm(prev_pokemon_id)));
        }
        const next_pokemon_id = parseInt(pokemon_id) + i;
        if (next_pokemon_id <= jb_max_id) {
            $("#next-containers").append(
                GetPokemonContainer(next_pokemon_id, false,
                    GetPokemonDefaultForm(next_pokemon_id)));
        }
    }

    // sets additional pokemon containers

    let additional_cs = $("#additional-containers");

    const can_be_mega = jb_mega[pokemon_id];

    if (can_be_mega) {
        if (pokemon_id == 6 || pokemon_id == 150) { // charizard and mewtwo
            additional_cs.append(GetPokemonContainer(
                    pokemon_id, mega && !mega_y, "Normal", true, false));
            additional_cs.append(GetPokemonContainer(
                    pokemon_id, mega && mega_y, "Normal", true, true));
        } else {
            additional_cs.append(
                GetPokemonContainer(pokemon_id, mega, "Normal", true));
        }
    }

    const additional_forms = forms.slice(1);

    for (f of additional_forms) {
        additional_cs.append(
            GetPokemonContainer(pokemon_id, form == f, f));
    }

    // deals with additional containers overflow
    if (additional_cs.children().length > 6)
        additional_cs.addClass("additional-containers-overflow");
    else
        additional_cs.removeClass("additional-containers-overflow");

    // displays what should be displayed
    if ($("#strongest").css("display") != "none")
        $("#strongest").css("display", "none");
    if ($("#pokedex").css("display") == "none")
        $("#pokedex").css("display", "block");
    if ($("#pokemongo").css("display") == "none")
        $("#pokemongo").css("display", "initial");
    if ($("#counters").css("display") != "none")
        $("#counters").css("display", "none");
    if ($("#counters-popup").css("display") != "none")
        $("#counters-popup").css("display", "none");

    LoadPokemongo(pokemon_id, form, mega, mega_y, level, ivs);
}

/**
 * Gets the pokemon id from a clean input (lowercase alphanumeric).
 * The input could be the id itself or the pokemon name.
 * Returns 0 if it doesn't find it.
 */
function GetPokemonId(clean_input) {

    // checks for an id
    if (/^\d+$/.test(clean_input)) { // if input is an integer
        if (clean_input >= 1 && clean_input <= jb_max_id)
            return parseInt(clean_input);
    }

    // checks for a name
    let pokemon_id = 0;
    Object.keys(jb_names).forEach(function (key) {
        if (Clean(jb_names[key].name) == clean_input)
            pokemon_id = key;
    });

    // if still didn't find anything
    if (pokemon_id == 0) {

        // checks for stupid nidoran
        if (clean_input == "nidoranf")
            return 29;
        else if (clean_input == "nidoranm")
            return 32;
    }

    if (pokemon_id > jb_max_id)
        return 0;

    return parseInt(pokemon_id);
}

/**
 * Gets array of specific pokemon types. Takes into account form and whether
 * is mega.
 */
function GetPokemonTypesFromId(pokemon_id, form, mega, mega_y) {

    let jb_pkm_obj = jb_pkm.find(entry =>
            entry.id == pokemon_id && entry.form == form);
    return (jb_pkm_obj) ? GetPokemonTypes(jb_pkm_obj, mega, mega_y) : [];
}

/**
 * Gets array of specific pokemon types.
 */
function GetPokemonTypes(jb_pkm_obj, mega, mega_y) {

    types = [];

    if (mega_y) {
        if (jb_pkm_obj.mega && jb_pkm_obj.mega[1])
            types = jb_pkm_obj.mega[1].types;
    } else if (mega) {
        if (jb_pkm_obj.mega && jb_pkm_obj.mega[0])
            types = jb_pkm_obj.mega[0].types;
    } else {
        types = jb_pkm_obj.types;
    }

    return types;
}

/**
 * Gets a pokemon container div element set up with a specified pokemon.
 */
function GetPokemonContainer(pokemon_id, is_selected, form = "Normal",
        mega = false, mega_y = false) {

    const pokemon_name = jb_names[pokemon_id].name;
    const clean_name = Clean(pokemon_name);
    const img_src_name = GetPokemonImgSrcName(pokemon_id, clean_name, form,
            mega, mega_y);
    let img_src = GIFS_URL + img_src_name + ".gif";
    const can_be_mega_y = pokemon_id == 6 || pokemon_id == 150; 
    const primal = mega && (pokemon_id == 382 || pokemon_id == 383);
    const form_text = GetFormText(pokemon_id, form);

    // container div
    const pokemon_container_div = $("<div></div>");

    // form text p
    if (form_text.length > 0) {
        const form_text_div = $("<div class='pokemon-form'>"
                + "<p class='pokefont unselectable small-text'>"
                + form_text + "</p></div>");
        pokemon_container_div.append(form_text_div);
    }

    // shiny img
    const shiny_img =
        $("<div class=shiny-img-div><img src=imgs/shiny.png></img></div>");
    pokemon_container_div.append(shiny_img);

    // img container div
    let img_container_div = $("<div class=img-container></div>");
    if (is_selected)
        img_container_div.css("border", "1px solid var(--col-main)");
    img_container_div.append(
            $("<img class=loading src=imgs/loading.gif></img>"));
    img_container_div.append($("<img class=pokemon-img "
            + "onload ='HideLoading(this)' onerror='TryNextSrc(this)'"
            + " onclick='SwapShiny(this)' src="
            + img_src + "></img>"));
    pokemon_container_div.append(img_container_div);

    // pokemon name p
    const pokemon_name_p= $("<p class='pokemon-name pokefont unselectable'"
            + "onclick='LoadPokemonAndUpdateURL(" + pokemon_id + ", \""
            + form + "\", " + mega + ", " + mega_y + ")'>#" + pokemon_id
            + ((primal) ? (" Primal ") : ((mega) ? " Mega " : " "))
            + pokemon_name
            + ((mega && can_be_mega_y) ? ((mega_y) ? " Y " : " X ") : "")
            + "</p>");
    pokemon_container_div.append(pokemon_name_p);

    // pokemon types
    const types = GetPokemonTypesFromId(pokemon_id, form, mega, mega_y);
    const pokemon_types_div = $("<div class=pokemon-types></div>");
    for (type of types) {
        pokemon_types_div.append($("<img src=imgs/types/"
                + type.toLowerCase() + ".gif></img>"));
    }
    pokemon_container_div.append(pokemon_types_div);

    return pokemon_container_div;
}

/**
 * Loads one pokemon data for the Pokemon GO section.
 */
function LoadPokemongo(pokemon_id, form, mega, mega_y, level, ivs) {

    let jb_pkm_obj = jb_pkm.find(entry =>
            entry.id == pokemon_id && entry.form == form);
    let released = true && jb_pkm_obj;
    if (mega)
        released = released && jb_pkm_obj.mega;
    if (mega_y)
        released = released && jb_pkm_obj.mega.length == 2;

    // if this pokemon is not released in pokemon go yet...
    if (!released) {
        $("#not-released").css("display", "initial");
        $("#released").css("display", "none");
        if ($("#legend").css("display") != "none")
            $("#legend").css("display", "none");
        return;
    }

    // if this pokemon is released in pokemon go...

    $("#not-released").css("display", "none");
    $("#released").css("display", "initial");
    if ($("#legend").css("display") == "none")
        $("#legend").css("display", "initial");

    const stats = GetPokemonStats(jb_pkm_obj, mega, mega_y, level, ivs);
    let max_stats = null;
    if (ivs.atk != 15 || ivs.def != 15 || ivs.hp != 15)
        max_stats = GetPokemonStats(jb_pkm_obj, mega, mega_y, level);

    // sets global variables
    current_jb_pkm_obj = jb_pkm_obj;
    current_mega = mega;
    current_mega_y = mega_y;
    counters_loaded = false;

    LoadPokemongoBaseStats(stats);
    LoadPokemongoCP(stats);
    UpdatePokemongoCPText(level, ivs);
    LoadPokemongoEffectiveness(jb_pkm_obj, mega, mega_y);
    ResetPokemongoCounters(jb_pkm_obj);
    LoadPokemongoTable(jb_pkm_obj, mega, mega_y, stats, max_stats);
}

/**
 * Gets the Pokemon GO stats of a specific pokemon. If level or ivs aren't
 * specified, they default to the settings level and the maximum ivs.
 */
function GetPokemonStats(jb_pkm_obj, mega, mega_y, level = null, ivs = null) {

    if (!level)
        level = settings_default_level;
    if (!ivs)
        ivs = { atk: 15, def: 15, hp: 15 };

    let stats;

    if (mega && mega_y) // mega y
        stats = jb_pkm_obj.mega[1].stats;
    else if (mega) // mega x or normal mega
        stats = jb_pkm_obj.mega[0].stats;
    else // any form non mega
        stats = jb_pkm_obj.stats;

    let cpm = GetCPMForLevel(level);

    stats.atk = (stats.baseAttack + ivs.atk) * cpm;
    stats.def = (stats.baseDefense + ivs.def) * cpm;
    stats.hp = (stats.baseStamina + ivs.hp) * cpm;

    return {...stats}; // returns by copy to prevent reassignment of reference
}

/**
 * Loads the section containing the base stats of the selected pokemon.
 * 
 * The bar indicator is based on the base stat number, with the ceiling being the
 * base stat value from the pokemon with the strongest value for that particular
 * base stat.
 */
function LoadPokemongoBaseStats(stats) {

    const user_agent = window.navigator.userAgent;
    const is_apple = user_agent.includes("Macintosh")
        || user_agent.includes("iPhone") || user_agent.includes("iPad")
        || user_agent.includes("iPod");

    const atk_ceil = 345; // current top atk pkm: Deoxys - 345
    const def_ceil = 396; // current top def pkm: Shuckle - 396
    const hp_ceil = 496; // current top hp pkm: Blissey - 496

    const atk = stats.baseAttack;
    const def = stats.baseDefense;
    const hp = stats.baseStamina;

    let atk_html = "atk <abbr class=ascii-bar title=" + atk + ">";
    let def_html = "def <abbr class=ascii-bar title=" + def + ">";
    let hp_html = "hp <abbr class=ascii-bar title=" + hp + ">";

    const gray_ch = (is_apple) ? "▒" : "▓";

    for (let i = 1; i <= 5; i++) {
        atk_html += (i * atk_ceil / 6 < atk)
            ? "█"  : ((i * atk_ceil / 6 - atk_ceil / 12 < atk)
                ? gray_ch : "░");
        def_html += (i * def_ceil / 6 < def)
            ? "█"  : ((i * def_ceil / 6 - def_ceil / 12 < def)
                ? gray_ch : "░");
        hp_html += (i * hp_ceil / 6 < hp)
            ? "█"  : ((i * hp_ceil / 6 - hp_ceil / 12 < hp)
                ? gray_ch : "░");
    }

    atk_html += "</abbr>";
    def_html += "</abbr>";
    hp_html += "</abbr>";

    $("#base-stat-atk").html(atk_html);
    $("#base-stat-def").html(def_html);
    $("#base-stat-hp").html(hp_html);

    if (is_apple) {
        $(".ascii-bar").addClass("monospace");
        $(".ascii-bar").css("font-size", "15px");
    }
}

/**
 * Loads the progress bar CP of the selected pokemon with its specific stats.
 */
function LoadPokemongoCP(stats) {

    let cp = Math.floor(stats.atk * Math.pow(stats.def, 0.5)
                * Math.pow(stats.hp, 0.5) / 10);
    if (cp < 10)
        cp = 10;

    let prgr_pct = cp * 100 / 5000;
    if (prgr_pct > 100)
        prgr_pct = 100;

    const width = 100 - prgr_pct;
    $(".prgr-val").css("width", width + "%");
    $("#max-cp").text("CP ");
    const bold_num = $("<b>" + cp + "</b>");
    $("#max-cp").append(bold_num);
}

/**
 * Updates the text for pokemon max cp to match the level and IVs being used to
 * calculate it.
 */
function UpdatePokemongoCPText(level, ivs) {

    const pct = Math.round(100 * (ivs.atk + ivs.def + ivs.hp) / 45);
    $("#cp-text").html("with IVs " + ivs.atk + "/" + ivs.def + "/" + ivs.hp
            + " (" + pct + "%) at level " + level
            + "<span id=rat-pct-vs-max></span>"
            + "<span id=sh-rat-pct-vs-max></span>");
}

/**
 * Loads table in the Pokemon GO section sorting the pokemon types according to
 * their effectiveness against the selected pokemon. Note that types that are
 * neutral towards the selected pokemon aren't displayed.
 */
function LoadPokemongoEffectiveness(jb_pkm_obj, mega, mega_y) {

    let types = jb_pkm_obj.types;
    if (mega) {
        if (mega_y)
            types = jb_pkm_obj.mega[1].types;
        else
            types = jb_pkm_obj.mega[0].types;
    }

    let effectiveness_0391 = [];
    let effectiveness_0625 = [];
    let effectiveness_160 = [];
    let effectiveness_256 = [];

    for (let attacker_type of POKEMON_TYPES) {
        const type_effect = POKEMON_TYPES_EFFECT.get(attacker_type);
        let mult = 1;
        for (let type of types) {
            if (type_effect[0].includes(type))
                mult *= 0.391;
            else if (type_effect[1].includes(type))
                mult *= 0.625;
            else if (type_effect[2].includes(type))
                mult *= 1.60;
        }
        if (Math.abs(mult - 0.391) < 0.001)
            effectiveness_0391.push(attacker_type);
        else if (Math.abs(mult - 0.625) < 0.001)
            effectiveness_0625.push(attacker_type);
        else if (Math.abs(mult - 1.60) < 0.001)
            effectiveness_160.push(attacker_type);
        else if (Math.abs(mult - 2.56) < 0.001)
            effectiveness_256.push(attacker_type);
    }

    $("#effectiveness-title").html("Types effectiveness against<br><b>"
            + jb_pkm_obj.name + "</b>");

    let effectiveness_0391_html = "";
    for (let type of effectiveness_0391) {
        effectiveness_0391_html += "<a class='type-text bg-" + type
                + "' onclick='LoadStrongestAndUpdateURL(\"" + type
                + "\")'>" + type + "</a> ";
    }
    $("#effectiveness-0391").html(effectiveness_0391_html);

    let effectiveness_0625_html = "";
    for (let type of effectiveness_0625) {
        effectiveness_0625_html += "<a class='type-text bg-" + type
                + "' onclick='LoadStrongestAndUpdateURL(\"" + type
                + "\")'>" + type + "</a> ";
    }
    $("#effectiveness-0625").html(effectiveness_0625_html);

    let effectiveness_160_html = "";
    for (let type of effectiveness_160) {
        effectiveness_160_html += "<a class='type-text bg-" + type
                + "' onclick='LoadStrongestAndUpdateURL(\"" + type
                + "\")'>" + type + "</a> ";
    }
    $("#effectiveness-160").html(effectiveness_160_html);

    let effectiveness_256_html = "";
    for (let type of effectiveness_256) {
        effectiveness_256_html += "<a class='type-text bg-" + type
                + "' onclick='LoadStrongestAndUpdateURL(\"" + type
                + "\")'>" + type + "</a> ";
    }
    $("#effectiveness-256").html(effectiveness_256_html);
}

/**
 * Resets the pokemon go counters section for the current selected pokemon.
 */
function ResetPokemongoCounters(enemy_jb_pkm_obj) {

    // sets proper counters title and disclaimer
    const verb = ($("#counters").css("display") == "none") ? "show" : "hide";
    $("#counters-button").html(verb + " <b>" + enemy_jb_pkm_obj.name + "</b>'s counters")
    $("#counters-disclaimer").html(
        "calculations take into account the counters effectiveness against "
        + enemy_jb_pkm_obj.name
        + "<br>and the counters resistance to the average of "
        + enemy_jb_pkm_obj.name + "'s movesets");
    
    // shows cell with loading image in the counters table
    $("#counters-tr").empty();
    let td = $("<td></td>");
    let img = $("<img class=loading src=imgs/loading.gif></img>");
    td.append(img);
    td.css("height", "125px");
    $("#counters-tr").append(td);
}

/**
 * Loads best counters of selected pokemon.
 * Searches asynchronously through all the pokemon in the game and calculates
 * the best counters taking into account their effectiveness against the selected
 * mon and their resistance to the average of the selected mon's movesets.
 */
function LoadPokemongoCounters(enemy_jb_pkm_obj, enemy_mega, enemy_mega_y) {

    const enemy_types = GetPokemonTypes(enemy_jb_pkm_obj, enemy_mega, enemy_mega_y);
    const enemy_effectiveness = GetTypesEffectivenessAgainstTypes(enemy_types);

    // gets checkboxes filters
    let search_unreleased =
        $("#counters input[value='unreleased']:checkbox").is(":checked");
    let search_mega =
        $("#counters input[value='mega']:checkbox").is(":checked");
    let search_shadow =
        $("#counters input[value='shadow']:checkbox").is(":checked");
    let search_legendary =
        $("#counters input[value='legendary']:checkbox").is(":checked");
    let search_elite =
        $("#counters input[value='elite']:checkbox").is(":checked");

    const num_counters = 6;
    const num_mega_counters = 5;

    // array of counters pokemon and movesets found so far
    let counters = [];
    let mega_counters = [];

    /**
     * Checks if any of the movesets of a specific pokemon is stronger than any
     * of the current counters. If it is, updates the counters arrays.
     * 
     * There is one array for regular pokemon and other for mega pokemon.
     *
     * The arrays are sorted every time so that it is always the weakest
     * pokemon in it that gets replaced.
     */
    function CheckIfStronger(jb_pkm_obj, mega, mega_y, shadow) {

        const movesets = GetPokemonStrongestMovesetsAgainstEnemy(jb_pkm_obj,
                mega, mega_y, shadow, search_elite, enemy_jb_pkm_obj,
                enemy_mega, enemy_mega_y, enemy_types, enemy_effectiveness);
        if (movesets.length == 0)
            return;

        for (let moveset of movesets) {

            let is_strong_enough = false;

            let not_full = ((mega)
                    ? mega_counters.length < num_mega_counters
                    : counters.length < num_counters);
            let weakest = ((mega) ? mega_counters[0] : counters[0]);

            if (not_full) { // if array isn't full...
                if (moveset.rat > 0)
                    is_strong_enough = true;
            } else { // if array is full...
                // if finds something better than worst in array...
                if (moveset.rat > weakest.rat)
                    is_strong_enough = true;
            }

            if (is_strong_enough) {

                // adds pokemon to array of counters
                const counter = {
                    rat: moveset.rat, id: jb_pkm_obj.id,
                    name: jb_pkm_obj.name, form: jb_pkm_obj.form,
                    mega: mega, mega_y: mega_y, shadow: shadow,
                    fm: moveset.fm, fm_is_elite: moveset.fm_is_elite,
                    fm_type: moveset.fm_type,
                    cm: moveset.cm, cm_is_elite: moveset.cm_is_elite,
                    cm_type: moveset.cm_type,
                    deaths: moveset.deaths
                };

                if (mega) {
                    if (mega_counters.length < num_mega_counters)
                        mega_counters.push(counter);
                    else
                        mega_counters[0] = counter;
                    // sorts array
                    mega_counters.sort(function compareFn(a , b) {
                        return ((a.rat > b.rat) || - (a.rat < b.rat));
                    });
                } else {
                    if (counters.length < num_counters)
                        counters.push(counter);
                    else
                        counters[0] = counter;
                    // sorts array
                    counters.sort(function compareFn(a , b) {
                        return ((a.rat > b.rat) || - (a.rat < b.rat));
                    });
                }
            }
        }
    }

    // searches for pokemon asynchronously in chunks - one chunk every frame

    // number of pokemon searched in each chunk
    const chunk_size = Math.ceil(jb_max_id / 10);

    /**
     * Searches one chunk of pokemon.
     * Receives the index of the chunk to search and the callback function
     * for when all chunks have been searched.
     */
    function SearchOneChunkOfPokemon(chunk_i, callback) {

        for (let id = chunk_i * chunk_size;
                id < (chunk_i + 1) * chunk_size && id <= jb_max_id; id++) {

            const forms = GetPokemonForms(id);
            const def_form = forms[0];

            let jb_pkm_obj = jb_pkm.find(entry =>
                    entry.id == id && entry.form == def_form);

            // checks whether pokemon should be skipped
            // (not released or legendary when not allowed)
            if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released
                    || !search_legendary && jb_pkm_obj.class) {
                continue;
            }

            const can_be_shadow = jb_pkm_obj.shadow;
            const can_be_mega = jb_pkm_obj.mega;

            // default form
            CheckIfStronger(jb_pkm_obj, false, false, false);

            // shadow (except not released when it shouldn't)
            if (search_shadow && can_be_shadow
                    && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
                CheckIfStronger(jb_pkm_obj, false, false, true);
            }

            // mega(s)
            if (search_mega && can_be_mega) {
                CheckIfStronger(jb_pkm_obj, true, false, false);
                if (id == 6 || id == 150) // charizard and mewtwo
                    CheckIfStronger(jb_pkm_obj, true, true, false);
            }

            // other forms
            for (let form_i = 1; form_i < forms.length; form_i++) {

                jb_pkm_obj = jb_pkm.find(entry =>
                        entry.id == id && entry.form == forms[form_i]);

                // checks whether pokemon should be skipped (form not released)
                if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released)
                    continue;

                CheckIfStronger(jb_pkm_obj, false, false, false);
                // other forms and shadow (except not released when it shouldn't)
                if (search_shadow && can_be_shadow
                        && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
                    CheckIfStronger(jb_pkm_obj, false, false, true);
                }
            }
        }

        // searches the next chunk of pokemon, if there is more
        chunk_i++;
        if (chunk_i * chunk_size <= jb_max_id) {
            setTimeout(function() { SearchOneChunkOfPokemon(chunk_i, callback); }, 0);
            return;
        } else {
            callback();
        }
    }

    loading_counters = true;
    // searches for the first chunk of pokemon
    setTimeout(function() {
        SearchOneChunkOfPokemon(0, function () {
            ProcessAndSetCountersFromArrays(counters, mega_counters);
            loading_counters = false;
        });
    }, 0);
}

/**
 * Gets array with an arbitrary number of a specific pokemon's strongest movesets
 * against a specific enemy pokemon.
 */
function GetPokemonStrongestMovesetsAgainstEnemy(jb_pkm_obj, mega, mega_y, shadow,
        search_elite, enemy_jb_pkm_obj, enemy_mega, enemy_mega_y,
        enemy_types, enemy_effectiveness) {

    const num_movesets = 6;
    let movesets = [];

    // checks whether this pokemon is actually released,
    // and if not, returns empty

    let released = true && jb_pkm_obj;
    if (mega)
        released = released && jb_pkm_obj.mega;
    if (mega_y)
        released = released && jb_pkm_obj.mega.length == 2;

    if (!released)
        return movesets;

    // gets the necessary data to make the rating calculations

    // subject data
    const types = GetPokemonTypes(jb_pkm_obj, mega, mega_y);
    const effectiveness = GetTypesEffectivenessAgainstTypes(types);
    const stats = GetPokemonStats(jb_pkm_obj, mega, mega_y);
    const atk = (shadow) ? (stats.atk * 6 / 5) : stats.atk;
    const def = (shadow) ? (stats.def * 5 / 6) : stats.def;
    const hp = stats.hp;
    const moves = GetPokemongoMoves(jb_pkm_obj);
    if (moves.length != 4)
        return movesets;
    const fms = moves[0];
    const cms = moves[1];
    const elite_fms = moves[2];
    const elite_cms = moves[3];
    const all_fms = fms.concat(elite_fms);
    const all_cms = cms.concat(elite_cms);

    // enemy data
    let avg_y = null;
    const enemy_stats = GetPokemonStats(enemy_jb_pkm_obj, enemy_mega, enemy_mega_y);
    const enemy_moves = GetPokemongoMoves(enemy_jb_pkm_obj);
    if (enemy_moves.length == 4) {
        const enemy_fms = enemy_moves[0];
        const enemy_cms = enemy_moves[1];
        const enemy_elite_fms = enemy_moves[2];
        const enemy_elite_cms = enemy_moves[3];
        const enemy_all_fms = enemy_fms.concat(enemy_elite_fms);
        const enemy_all_cms = enemy_cms.concat(enemy_elite_cms);
        avg_y = GetMovesetsAvgY(enemy_types, enemy_stats.atk,
                enemy_all_fms, enemy_all_cms, effectiveness, def);
    }

    // searches for the movesets

    for (fm of all_fms) {

        const fm_is_elite = elite_fms.includes(fm);

        if (!search_elite && fm_is_elite)
            continue;

        // gets the fast move object
        const fm_obj = jb_fm.find(entry => entry.name == fm);
        if (!fm_obj)
            continue;
        const fm_mult =
            GetEffectivenessMultOfType(enemy_effectiveness, fm_obj.type);

        for (cm of all_cms) {

            const cm_is_elite = elite_cms.includes(cm);

            if (!search_elite && cm_is_elite)
                continue;

            // gets the charged move object
            const cm_obj = jb_cm.find(entry => entry.name == cm);
            if (!cm_obj)
                continue;
            const cm_mult =
                GetEffectivenessMultOfType(enemy_effectiveness, cm_obj.type);

            // calculates the data
            const dps = GetDPS(types, atk, def, hp, fm_obj, cm_obj,
                fm_mult, cm_mult, enemy_stats.def, avg_y);
            const tdo = GetTDO(dps, hp, def, avg_y);
            // metrics from Reddit user u/Elastic_Space
            let rat = 0;
            if (settings_metric == "ER") {
                const dps3tdo = Math.pow(dps, 3) * tdo;
                rat = Math.pow(dps3tdo, 1/4);
            } else if (settings_metric == "EER") {
                rat = Math.pow(dps, 0.775) * Math.pow(tdo, 0.225);
            } else if (settings_metric == "TER") {
                rat = Math.pow(dps, 0.85) * Math.pow(tdo, 0.15);
            }

            // if the array of movesets isn't full
            // or the current moveset is stronger than the weakest in the array,
            // pushes the current moveset to the array
            if (movesets.length < num_movesets) {
                const moveset = {
                    rat: rat,
                    fm: fm, fm_is_elite: fm_is_elite, fm_type: fm_obj.type,
                    cm: cm, cm_is_elite: cm_is_elite, cm_type: cm_obj.type,
                    deaths: 300 * avg_y / hp
                };
                movesets.push(moveset);
                // sorts array
                movesets.sort(function compareFn(a , b) {
                    return ((a.rat > b.rat) || - (a.rat < b.rat));
                });
            } else if (rat > movesets[0].rat) {
                const moveset = {
                    rat: rat,
                    fm: fm, fm_is_elite: fm_is_elite, fm_type: fm_obj.type,
                    cm: cm, cm_is_elite: cm_is_elite, cm_type: cm_obj.type,
                    deaths: 300 * avg_y / hp
                };
                movesets[0] = moveset;
                // sorts array
                movesets.sort(function compareFn(a , b) {
                    return ((a.rat > b.rat) || - (a.rat < b.rat));
                });
            }
        }
    }

    return movesets;
}

/**
 * Gets the average y (dps) of all the movesets of a specific pokemon attacking
 * a specific enemy.
 */
function GetMovesetsAvgY(types, atk, fms, cms, enemy_effectiveness, enemy_def = null) {

    let avg_y = 0;
    let num_movesets = 0;

    for (let fm of fms) {

        // gets the fast move object
        const fm_obj = jb_fm.find(entry => entry.name == fm);
        if (!fm_obj)
            continue;
        const fm_mult = GetEffectivenessMultOfType(enemy_effectiveness, fm_obj.type);

        for (let cm of cms) {

            // gets the charged move object
            const cm_obj = jb_cm.find(entry => entry.name == cm);
            if (!cm_obj)
                continue;
            const cm_mult = GetEffectivenessMultOfType(enemy_effectiveness, cm_obj.type);

            avg_y += GetSpecificY(types, atk, fm_obj, cm_obj, fm_mult, cm_mult, enemy_def);
            num_movesets++;
        }
    }

    avg_y /= num_movesets;
    return avg_y;
}

/**
 * Processes the counters in the 'counters' and 'mega_counters' arrays
 * and sets them in the page.
 * 
 * The arrays contain the counters sorted in ascending order.
 */
function ProcessAndSetCountersFromArrays(counters, mega_counters) {

    // reverses counters arrays to be in descending order
    counters.reverse();
    mega_counters.reverse();

    // simplifies counters arrays into maps where each pokemon species is a key
    let counters_s = new Map();
    for (let counter of counters) {
        if (!counters_s.has(counter.id))
            counters_s.set(counter.id, [])
        counters_s.get(counter.id).push(counter);
    }
    let mega_counters_s = new Map();
    for (let counter of mega_counters) {
        if (!mega_counters_s.has(counter.id))
            mega_counters_s.set(counter.id, [])
        mega_counters_s.get(counter.id).push(counter);
    }

    // converts simplified maps into one array containing arrays of counters
    // for each pokemon species
    const all_counters =
        Array.from(mega_counters_s.values()).concat(Array.from(counters_s.values()));

    // gets strongest rat
    const top_rat = ((mega_counters[0].rat > counters[0].rat)
            ? mega_counters[0].rat : counters[0].rat);

    // sets counters in the page

    $("#counters-tr").empty();

    for (let i = 0; i < all_counters.length; i++) { // for each counter...

        let counter_0 = all_counters[i][0];

        // sets counter's rating percentage span
        let rat_pcts_span = $("<span class='counter-rat-pct'></span>");
        for (let counter of all_counters[i]) {
            let rat_pct = 100 * counter.rat / top_rat;
            let rat_pct_a = $("<a></a>");
            rat_pct_a.html("<b>" + rat_pct.toFixed(0) + "%</b>"
                + ((counter.mega)?" (M)":"")
                + ((counter.shadow)?" (Sh)":"") + "<br>");
            if (has_touch_screen) {
                rat_pct_a.click(function() {
                    ShowCountersPopup(this, true, counter);
                });
            } else {
                rat_pct_a.mouseenter(function() {
                    ShowCountersPopup(this, true, counter);
                });
                rat_pct_a.mouseleave(function() {
                    ShowCountersPopup(this, false);
                });
                rat_pct_a.click(function() {
                    LoadPokemonAndUpdateURL(counter.id, counter.form,
                        counter.mega, counter.mega_y);
                    window.scrollTo(0, 0);
                });
            }
            rat_pcts_span.append(rat_pct_a);
        }

        // sets counter's image
        let img = $("<img onload='HideLoading(this)' onerror='TryNextSrc(this)'></img>");
        let img_src_name = GetPokemonImgSrcName(counter_0.id, Clean(counter_0.name),
                counter_0.form, counter_0.mega, counter_0.mega_y);
        let img_src = GIFS_URL + img_src_name + ".gif";
        img.attr("src", img_src);
        let td = $("<td></td>");

        // sets table cell and appends it to the row
        td.append(rat_pcts_span);
        td.append($("<img class=loading src=imgs/loading.gif></img>"));
        td.append(img);
        $("#counters-tr").append(td);
    }
}

/**
 * Shows or hides the popup of the counter whose rating percentage label is
 * currently being hovered.
 * 
 * Receives the object of the element being hovered, whether it should show or
 * hide the popup, and the counter object.
 */
function ShowCountersPopup(hover_element, show, counter = null) {

    if (show && counter) {

        // sets hover element's border for touch screens
        if (has_touch_screen) {
            let rat_pcts = $(".counter-rat-pct > a");
            for (rat_pct of rat_pcts)
                $(rat_pct).css("border", "none");
            $(hover_element).css("border", "1px solid var(--col-off)");
        }

        // sets the popup's position

        let pos = $(hover_element).offset();
        let w = $(hover_element).width();
        let h = $(hover_element).height();
        let x = pos.left + 0.5 * w - 100;
        let y = pos.top + 1.5 * h;

        $("#counters-popup").css("left", x);
        $("#counters-popup").css("top", y);

        // sets the popup's content

        const can_be_mega_y = counter.id == 6 || counter.id == 150; 
        const primal = counter.mega && (counter.id == 382 || counter.id == 383);
        const form_text = GetFormText(counter.id, counter.form);

        const name = "<b>"
            + ((primal) ? ("Primal ") : ((counter.mega) ? "Mega " : ""))
            + ((counter.shadow) ? "<span class=shadow-text>Shadow</span> " : "")
            + counter.name
            + ((counter.mega && can_be_mega_y) ? ((counter.mega_y) ? " Y" : " X") : "")
            + "</b></a>"
            + ((form_text.length > 0)
                ? " <span class=small-text>(" + form_text + ")</span>" 
                : "")

        $("#counters-popup").html("<span>" + name
            + "<br><span class='type-text bg-"
            + ((counter.fm == "Hidden Power") ? "any-type" : counter.fm_type) + "'>"
            + counter.fm + ((counter.fm_is_elite) ? "*" : "")
            + "</span> <span class='type-text bg-" + counter.cm_type + "'>"
            + counter.cm + ((counter.cm_is_elite) ? "*" : "")
            + "</span></span>");

        // sets popup's click callback for touch devices
        if (has_touch_screen) {
            $("#counters-popup").unbind("click");
            $("#counters-popup").click( function() {
                LoadPokemonAndUpdateURL(counter.id, counter.form,
                    counter.mega, counter.mega_y);
                window.scrollTo(0, 0);
            });
        }

        // shows the popup
        $("#counters-popup").css("display", "inline");

    } else {
        // hides the popup
        $("#counters-popup").css("display", "none");
    }
}

/**
 * Loads the table in the Pokemon Go section including information about
 * the possible move combinations and their ratings.
 * 
 * If the argument 'max_stats' is received, also calculates the average rating
 * percentage of the specific stats against the max stats (15/15/15 ivs)
 * of all movesets. This percentage is then displayed on the CP section.
 */
function LoadPokemongoTable(jb_pkm_obj, mega, mega_y, stats, max_stats = null) {

    // sets movesets title
    $("#movesets-title").html("<b>" + jb_pkm_obj.name + "'s movesets</b>");

    // whether can be shadow
    const can_be_shadow = jb_pkm_obj.shadow && !mega;

    // types
    const types = GetPokemonTypes(jb_pkm_obj, mega, mega_y);

    const atk = stats.atk;
    const def = stats.def;
    const hp = stats.hp;

    // shadow stats
    const atk_sh = atk * 6 / 5;
    const def_sh = def * 5 / 6;

    // removes previous table rows
    $("#pokemongo-table tr:not(.table-header)").remove();

    const moves = GetPokemongoMoves(jb_pkm_obj);
    if (moves.length != 4)
        return;

    const fms = moves[0];
    const cms = moves[1];
    const elite_fms = moves[2];
    const elite_cms = moves[3];

    const all_fms = fms.concat(elite_fms);
    const all_cms = cms.concat(elite_cms);

    // variables used to calculate average rating percentages against max stats
    let rat_pcts_vs_max = 0;
    let rat_sh_pcts_vs_max = 0;
    let num_movesets = 0;

    // appends new table rows asynchronously (so that Mew loads fast)
    // each chunk of moves combinations with a specific fast move
    // is appended in a different frame

    /**
     * Appends all the rows containing a specific fast move.
     * Receives the index of the fast move and the callback function
     * for when all chunks have been appended as arguments.
     */
    function AppendFMChunk(fm_i, callback) {

        const fm = all_fms[fm_i];
        const fm_is_elite = elite_fms.includes(fm);

        // gets the fast move object
        const fm_obj = jb_fm.find(entry => entry.name == fm);
        if (!fm_obj) {
            fm_i++;
            if (fm_i < all_fms.length)
                setTimeout(function() {AppendFMChunk(fm_i, callback);}, 0);
            else
                callback();
            return;
        }

        const fm_type = fm_obj.type;

        for (cm of all_cms) {

            const cm_is_elite = elite_cms.includes(cm);

            // gets the charged move object
            const cm_obj = jb_cm.find(entry => entry.name == cm);
            if (!cm_obj)
                continue;

            const cm_type = cm_obj.type;

            // calculates the data

            const dps = GetDPS(types, atk, def, hp, fm_obj, cm_obj);
            const dps_sh = GetDPS(types, atk_sh, def_sh, hp,fm_obj,cm_obj);
            const tdo = GetTDO(dps, hp, def);
            const tdo_sh = GetTDO(dps_sh, hp, def_sh);
            // metrics from Reddit user u/Elastic_Space
            let rat = 0;
            let rat_sh = 0;
            if (settings_metric == "ER") {
                const dps3tdo = Math.pow(dps, 3) * tdo;
                const dps3tdo_sh = Math.pow(dps_sh, 3) * tdo_sh;
                rat = Math.pow(dps3tdo, 1/4);
                rat_sh = Math.pow(dps3tdo_sh, 1/4);
            } else if (settings_metric == "EER") {
                rat = Math.pow(dps, 0.775) * Math.pow(tdo, 0.225);
                rat_sh = Math.pow(dps_sh, 0.775) * Math.pow(tdo_sh, 0.225);
            } else if (settings_metric == "TER") {
                rat = Math.pow(dps, 0.85) * Math.pow(tdo, 0.15);
                rat_sh = Math.pow(dps_sh, 0.85) * Math.pow(tdo_sh, 0.15);
            }

            // calculates average rating percentages against max stats
            if (max_stats) {
                const max_dps = GetDPS(types, max_stats.atk, max_stats.def,
                    max_stats.hp, fm_obj, cm_obj);
                const max_tdo = GetTDO(max_dps, max_stats.hp, max_stats.def);
                // metrics from Reddit user u/Elastic_Space
                let max_rat = 0;
                if (settings_metric == "ER") {
                    const max_dps3tdo = Math.pow(max_dps, 3) * max_tdo;
                    max_rat = Math.pow(max_dps3tdo, 1/4);
                } else if (settings_metric == "EER") {
                    max_rat = Math.pow(max_dps, 0.775) * Math.pow(max_tdo, 0.225);
                } else if (settings_metric == "TER") {
                    max_rat = Math.pow(max_dps, 0.85) * Math.pow(max_tdo, 0.15);
                }

                rat_pcts_vs_max += rat / max_rat;
                rat_sh_pcts_vs_max += rat_sh / max_rat;
            } else {
                rat_sh_pcts_vs_max += rat_sh / rat;
            }
            num_movesets++;

            // creates one row

            const tr = $("<tr></tr>");
            const td_fm = $("<td><span class='type-text bg-"
                    + ((fm == "Hidden Power") ? "any-type" : fm_type)
                    + "'>" + fm + ((fm_is_elite) ? "*" : "")
                    + "</span></td>");
            const td_cm = $("<td><span class='type-text bg-" + cm_type
                    + "'>" + cm + ((cm_is_elite) ? "*" : "")
                    + "</span></td>");
            const td_dps = $("<td>" + dps.toFixed(3) + "</td>");
            const td_dps_sh = $("<td>"
                    + ((can_be_shadow) ? dps_sh.toFixed(3) : "-")
                    + "</td>");
            const td_tdo = $("<td>" + tdo.toFixed(1) + "</td>");
            const td_tdo_sh = $("<td>"
                    + ((can_be_shadow) ? tdo_sh.toFixed(1) : "-")
                    + "</td>");
            const td_rat = $("<td>" + rat.toFixed(2) + "</td>");
            const td_rat_sh = $("<td>"
                    + ((can_be_shadow) ? rat_sh.toFixed(2) : "-")
                    + "</td>");

            tr.append(td_fm);
            tr.append(td_cm);
            tr.append(td_dps);
            tr.append(td_dps_sh);
            tr.append(td_tdo);
            tr.append(td_tdo_sh);
            tr.append(td_rat);
            tr.append(td_rat_sh);

            $("#pokemongo-table").append(tr);
        }

        // if necessary, calculates average rating percentage of specific stats
        // against max stats of all movesets and displays it on the CP section
        if (max_stats) {
            let avg_rat_pct_vs_max = 100 * rat_pcts_vs_max / num_movesets;
            let pct_str = avg_rat_pct_vs_max.toFixed(2) + "%";
            if (isNaN(avg_rat_pct_vs_max))
                pct_str = "??";
            $("#rat-pct-vs-max").html(" → " + settings_metric + " " + pct_str);
        }

        // if can be shadow, calculates average rating percentage of shadow stats
        // against max stats of all movesets and displays it on the CP section
        if (can_be_shadow) {
            let avg_rat_sh_pct_vs_max = 100 * rat_sh_pcts_vs_max / num_movesets;
            let pct_str = avg_rat_sh_pct_vs_max.toFixed(2) + "%";
            if (isNaN(avg_rat_sh_pct_vs_max))
                pct_str = "??";
            $("#sh-rat-pct-vs-max").html("<br> → Shadow " + settings_metric
                    + " " + pct_str);
        }

        // appends the next fast move chunk, if there is more
        fm_i++;
        if (fm_i < all_fms.length)
            setTimeout(function() {AppendFMChunk(fm_i, callback);}, 0);
        else
            callback();
    }

    loading_pogo_moves = true;
    // appends the first fast move chunk
    AppendFMChunk(0, function() {
        SortPokemongoTable(6);
        loading_pogo_moves = false;
    });
}

/**
 * Gets array of four arrays. The specified Pokemon's fast moves, elite fast
 * moves, charged moves and elite charged moves.
 */
function GetPokemongoMoves(jb_pkm_obj) {

    if (!jb_pkm_obj.fm && !jb_pkm_obj.cm)
        return [];

    let fm = jb_pkm_obj.fm.slice();
    let elite_fm = [];
    if (jb_pkm_obj.elite_fm)
        elite_fm = jb_pkm_obj.elite_fm.slice();
    let cm = jb_pkm_obj.cm.slice();
    let elite_cm = [];
    if (jb_pkm_obj.elite_cm)
        elite_cm = jb_pkm_obj.elite_cm.slice();

    // checks for hidden power
    if (fm.includes("Hidden Power") || elite_fm.includes("Hidden Power")) {
        for (let type of POKEMON_TYPES) {
            if (!["Normal", "Fairy"].includes(type) && jb_pkm_obj.types.includes(type)) {
                if (fm.includes("Hidden Power"))
                    fm.push("Hidden Power " + type);
                if (elite_fm.includes("Hidden Power"))
                    elite_fm.push("Hidden Power " + type)
            }
        }
    }

    return [fm, cm, elite_fm, elite_cm];
}

/**
 * Gets the comprehensive DPS of a pokemon of some type(s) and with some
 * stats using a specific fast move and charged move.
 *
 * Formula credit to https://gamepress.gg .
 * https://gamepress.gg/pokemongo/damage-mechanics
 * https://gamepress.gg/pokemongo/how-calculate-comprehensive-dps
 * 
 * Can receive multipliers for the fast move and charged move, in
 * case of being aware of the effectiveness of the move against the enemy mon.
 * Also can receive the enemy defense stat and the y - enemy's DPS - if known.
 */
function GetDPS(types, atk, def, hp, fm_obj, cm_obj, fm_mult = 1, cm_mult = 1,
        enemy_def = null, y = null) {

    if (!fm_obj || !cm_obj)
        return 0;

    // misc variables
    if (!enemy_def)
        enemy_def = 160;
    const x = 0.5 * -cm_obj.energy_delta + 0.5 * fm_obj.energy_delta;
    if (!y)
        y = 900 / def;

    // fast move variables
    const fm_dmg_mult = fm_mult
        * ((types.includes(fm_obj.type) && fm_obj.name != "Hidden Power") ? 1.2 : 1);
    const fm_dmg = 0.5 * fm_obj.power * (atk / enemy_def) * fm_dmg_mult + 0.5;
    const fm_dps = fm_dmg / ProcessDuration(fm_obj.duration);
    const fm_eps = fm_obj.energy_delta / ProcessDuration(fm_obj.duration);

    // charged move variables
    const cm_dmg_mult = cm_mult * ((types.includes(cm_obj.type)) ? 1.2 : 1);
    const cm_dmg = 0.5 * cm_obj.power * (atk / enemy_def) * cm_dmg_mult + 0.5;
    const cm_dps = cm_dmg / ProcessDuration(cm_obj.duration);
    let cm_eps = -cm_obj.energy_delta / ProcessDuration(cm_obj.duration);
    // penalty to one-bar charged moves in old raid system (they use more energy (cm_eps))
    if (settings_raid_system == "old" && cm_obj.energy_delta == -100) {
        const dws = cm_obj.damage_window_start / 1000; // dws in seconds
        cm_eps = (-cm_obj.energy_delta + 0.5 * fm_obj.energy_delta
                + 0.5 * y * dws) / ProcessDuration(cm_obj.duration);
    }

    // simple cycle DPS
    const dps0 = (fm_dps * cm_eps + cm_dps * fm_eps) / (cm_eps + fm_eps);
    // comprehensive DPS
    const dps = dps0 + ((cm_dps - fm_dps) / (cm_eps + fm_eps))
            * (0.5 - x / hp) * y;

    return ((dps < 0) ? 0 : dps);
}

/**
 * In the GamePress formula, y is the DPS of the enemy.
 * Usually y equals 900 / def but there is a more sophisticated formula to
 * calculate it when the enemy is known.
 * 
 * This function gets y from a specified enemy.
 * 
 * Formula credit to https://gamepress.gg .
 * https://gamepress.gg/pokemongo/how-calculate-comprehensive-dps
 */
function GetSpecificY(types, atk, fm_obj, cm_obj, fm_mult = 1, cm_mult = 1,
        enemy_def = null) {

    if (!fm_obj || !cm_obj)
        return 0;

    // misc variables
    if (!enemy_def)
        enemy_def = 160;
    const x = 0.5 * -cm_obj.energy_delta + 0.5 * fm_obj.energy_delta;

    // fast move variables
    const fm_dmg_mult = fm_mult
        * ((types.includes(fm_obj.type) && fm_obj.name != "Hidden Power") ? 1.2 : 1);
    const fm_dmg = 0.5 * fm_obj.power * (atk / enemy_def) * fm_dmg_mult + 0.5;

    // charged move variables
    const cm_dmg_mult = cm_mult * ((types.includes(cm_obj.type)) ? 1.2 : 1);
    const cm_dmg = 0.5 * cm_obj.power * (atk / enemy_def) * cm_dmg_mult + 0.5;
    let lambda = 1;
    switch (cm_obj.energy_delta) {
        case -100:
            lambda = 3;
            break;
        case -50:
            lambda = 1.5;
            break;
        case -33:
            lambda = 1;
            break;
    }

    // this isn't part of the formula
    // this multiplier attempts to tweak the specified y
    // to match the default (900 / def)
    const y_mult = 0.5;

    // specific y
    const y = y_mult * (lambda * fm_dmg + cm_dmg)
        / (lambda * (ProcessDuration(fm_obj.duration) + 2) + ProcessDuration(cm_obj.duration) + 2);

    return ((y < 0) ? 0 : y);
}

/**
 * Processes the duration of fast moves and charged moves.
 * The input is in milliseconds and the output is in seconds.
 * The output differs according to 'settings_raid_system'.
 * 
 * https://www.reddit.com/r/TheSilphRoad/comments/1f4wqw8/analysis_everything_you_thought_you_knew_about/
 */
function ProcessDuration(duration) {

    if (settings_raid_system == "new")
        return (Math.round((duration / 1000) * 2) / 2);
    return (duration / 1000);
}

/**
 * Gets the TDO of a pokemon using its DPS, HP, DEF and y if known.
 *
 * Formula credit to https://gamepress.gg .
 * https://gamepress.gg/pokemongo/how-calculate-comprehensive-dps
 */
function GetTDO(dps, hp, def, y = null) {

    if (!y)
        y = 900 / def;
    return (dps * (hp / y));
}

/**
 * Sorts the pokemon go moves combinations table rows according to the
 * values from a specific column.
 */
function SortPokemongoTable(column_i) {

    let table = $("#pokemongo-table")[0];

    // updates downside triangles
    let triangles = $(".th-triangle");
    for (triangle of triangles)
        triangle.remove();
    cells = table.rows[0].cells;
    for (let cell_i = 0; cell_i < cells.length; cell_i++) {
        let cell = $(cells[cell_i]);
        if (cell_i == column_i) {
            let triangle = $("<span class=th-triangle> ▾</span>");
            cell.append(triangle);
        } else if (cell.hasClass("sortable")) {
            let triangle = $("<span class=th-triangle> ▿</span>");
            cell.append(triangle);
        }
    }

    // sorts rows
    let rows_array = Array.from(table.rows).slice(1);
    rows_array = MergeSortPokemongoTable(rows_array, column_i);
    for (let i = 0; i < rows_array.length; i++)
        table.append(rows_array[i]);
}

/**
 * Applies the merge sort algorithm to the pokemon go table rows.
 * Sorts according to the values from a specific column.
 */
function MergeSortPokemongoTable(rows, column_i) {

    if (rows.length <= 1)
        return rows;

    const n = (rows.length / 2);
    let a = MergeSortPokemongoTable(rows.slice(0, n), column_i);
    let b = MergeSortPokemongoTable(rows.slice(n), column_i);

    return MergeRows(a, b, column_i);
}

/**
 * Part of the merge sort algorithm for the pokemon go table rows.
 * Sorts and merges two arrays of rows according to the values
 * from a specific column. Returns the single resulting array.
 */
function MergeRows(a, b, column_i) {

    function GetRowValue(row) {
        return parseFloat(
                row.getElementsByTagName("TD")[column_i]
                .innerHTML.toLowerCase());
    }

    let c = [];

    while (a.length > 0 && b.length > 0) {
        if (GetRowValue(a[0]) >= GetRowValue(b[0])) {
            c.push(a[0]);
            a.shift();
        } else {
            c.push(b[0]);
            b.shift();
        }
    }

    while (a.length > 0) {
        c.push(a[0]);
        a.shift();
    }

    while (b.length > 0) {
        c.push(b[0]);
        b.shift();
    }

    return c;
}

/**
 * Receives the pokemon image that just loaded as an argument.
 * Hides the placeholder loading image and shows the loaded pokemon image.
 */
function HideLoading(element) {

    const loading = $(element).parent().children(".loading");
    loading.css("display", "none");
    $(element).css("display", "initial");
}

/**
 * When a pokemon image source couldn't be loaded, this function tries the 
 * next option.
 * Eventually it will just load the 'notfound' image and stop trying.
 */
function TryNextSrc(element) {

    const src = $(element).attr("src");

    if (src.includes(GIFS_URL)) {
        // loads pogo-256 image
        let next_src = src.replace(GIFS_URL, POGO_PNGS_URL);
        next_src = next_src.replace(".gif", ".png");
        $(element).attr("src", next_src);
        $(element).css("width", "140px");
        $(element).css("height", "140px");

    } else {
        // loads notfound image and stops trying (disables error callback)
        const next_src = "imgs/notfound.png";
        $(element).attr("src", next_src);
        $(element).css("width", "96px");
        $(element).css("height", "96px");
        $(element).css("cursor", "default");
        $(element).off("onerror");
    }
}

/**
 * Swaps the pokemon image for its shiny form.
 */
function SwapShiny(element) {

    const pokemon_container = $(element).parent().parent();
    const shiny_img =
        pokemon_container.children(".shiny-img-div").children("img");

    let src = $(element).attr("src");

    if (src.includes(GIFS_URL)) {
        src = src.replace(GIFS_URL, SHINY_GIFS_URL);
        shiny_img.css("display", "initial");

    } else if (src.includes(SHINY_GIFS_URL)) {
        src = src.replace(SHINY_GIFS_URL, GIFS_URL);
        shiny_img.css("display", "none");

    } else if (src.includes(POGO_PNGS_URL)) {
        src = src.replace(POGO_PNGS_URL, SHINY_POGO_PNGS_URL);
        shiny_img.css("display", "initial");

    } else if (src.includes(SHINY_POGO_PNGS_URL)) {
        src = src.replace(SHINY_POGO_PNGS_URL, POGO_PNGS_URL);
        shiny_img.css("display", "none");
    }

    $(element).attr("src", src);
}

/**
 * Callback function for when pokemon stats are updated (level or/and IVs).
 * Reloads the pokemon page and the url with the new specified stats.
 */
function UpdatePokemonStatsAndURL() {

    const params = new URLSearchParams(location.search);

    // if url has pokemon params...
    if (params.has("p")) {

        const pkm = params.get("p");

        let form = "def";
        if (params.has("f"))
            form = params.get("f");

        let mega = false;
        if (params.has("m"))
            mega = true;

        let mega_y = false;
        if (params.has("y"))
            mega_y = true;

        let level = Number($("#input-lvl").val());

        let ivs = {};
        ivs.atk = parseInt($("#input-atk").val());
        ivs.def = parseInt($("#input-def").val());
        ivs.hp = parseInt($("#input-hp").val());

        LoadPokemonAndUpdateURL(pkm, form, mega, mega_y, level, ivs);
    }
}

/**
 * Callback function for when the 'show counters' or 'hide counters' button is
 * clicked.
 * It either shows or hides the counters, depending on whether they are visible.
 * 
 * It also loads the counters if they haven't been loaded for the current
 * selected pokemon yet.
 */
function ShowCounters() {

    $("#counters-popup").css("display", "none");

    const html = $("#counters-button").html();

    if ($("#counters").css("display") == "none") {
        $("#counters").css("display", "initial");
        $("#counters-button").html(html.replace("show ", "hide "));
    } else {
        $("#counters").css("display", "none");
        $("#counters-button").html(html.replace("hide ", "show "));
    }

    // if counters haven't been loaded for the current pokemon, loads them
    if (!counters_loaded) {
        counters_loaded = true;
        LoadPokemongoCounters(current_jb_pkm_obj, current_mega, current_mega_y);
    }
}

/**
 * Calls the 'LoadStrongest' function and updates the url accordingly.
 */
function LoadStrongestAndUpdateURL(type = "any") {

    if (!finished_loading)
        return false;

    LoadStrongest(type);

    let url = "?strongest&t=" + type;

    window.history.pushState({}, "", url);
}

/**
 * Loads the list of the strongest pokemon of a specific type in pokemon go.
 * The type can be 'each', 'any' or an actual type.
 */
function LoadStrongest(type = "any") {

    if (!finished_loading)
        return;

    // displays what should be displayed 
    if ($("#pokemongo").css("display") != "none")
        $("#pokemongo").css("display", "none");
    if ($("#pokedex").css("display") != "none")
        $("#pokedex").css("display", "none");
    if ($("#strongest").css("display") == "none")
        $("#strongest").css("display", "initial");
    if ($("#legend").css("display") == "none")
        $("#legend").css("display", "initial");

    // sets links
    let strongest_link_any = $("#strongest-links > ul:first() > li:nth-child(1)");
    let strongest_link_each = $("#strongest-links > ul:first() > li:nth-child(2)");
    strongest_link_any.removeClass("strongest-link-selected");
    strongest_link_each.removeClass("strongest-link-selected");
    if (type == "any")
        strongest_link_any.addClass("strongest-link-selected");
    else if (type == "each")
        strongest_link_each.addClass("strongest-link-selected");
    let links_types = $("#strongest-links-types");
    links_types.empty();
    for (const t of POKEMON_TYPES) {
        links_types.append("<li><a class='type-text bg-" + t
                + ((t == type) ? " strongest-link-selected" : "")
                + "' onclick='LoadStrongestAndUpdateURL(\"" + t
                + "\")'>" + t + "</a></li>");
    }

    // sets titles
    let title = "Strongest Pokémon of " + type + " type";
    document.title = title + " - Palkiadex"; // page title
    $("#strongest-title").text(title); // table title

    // removes previous table rows
    $("#strongest-table tr:not(.table-header)").remove();

    // gets checkboxes filters
    let search_unreleased =
        $("#strongest input[value='unreleased']:checkbox").is(":checked");
    let search_mega =
        $("#strongest input[value='mega']:checkbox").is(":checked");
    let search_shadow =
        $("#strongest input[value='shadow']:checkbox").is(":checked");
    let search_legendary =
        $("#strongest input[value='legendary']:checkbox").is(":checked");
    let search_elite =
        $("#strongest input[value='elite']:checkbox").is(":checked");
    let search_different_type =
        $("#strongest input[value='different-type']:checkbox").is(":checked");

    if (type == 'each') {
        SetTableOfStrongestOfEachType(search_unreleased, search_mega, search_shadow,
                search_legendary, search_elite, search_different_type);
    } else if (type == 'any') {
        SetTableOfStrongestOfAnyType(search_unreleased, search_mega, search_shadow,
                search_legendary, search_elite, search_different_type);
    } else {
        SetTableOfStrongestOfOneType(search_unreleased, search_mega, search_shadow,
                search_legendary, search_elite, search_different_type, type);
    }
}

/**
 * Searches the strongest pokemon of each type and sets the strongest
 * pokemon table with the result.
 */
function SetTableOfStrongestOfEachType(search_unreleased, search_mega,
        search_shadow, search_legendary, search_different_type, search_elite) {

    // map of strongest pokemon and moveset found so far for each type
    let str_pokemons = new Map();

    /**
     * Checks if the any of the strongest movesets of a specific pokemon
     * is stronger than any of the current strongest pokemon of each type.
     * If it is, updates the strongest pokemon map.
     */
    function CheckIfStronger(jb_pkm_obj, mega, mega_y, shadow) {

        const types_movesets = GetPokemonStrongestMovesetsOfEachType(jb_pkm_obj,
                mega, mega_y, shadow, search_different_type, search_elite);

        for (const type of POKEMON_TYPES) {

            // checks that pokemon has a moveset solely of this type
            if (!types_movesets.has(type))
                continue;

            const moveset = types_movesets.get(type);
            let is_stronger = false;

            if (!str_pokemons.has(type)) { // if no strong pkm yet...

                if (moveset.rat > 0)
                    is_stronger = true;

            } else { // if some strong pkm already...

                // if finds something better than worst in array...
                if (moveset.rat > str_pokemons.get(type).rat)
                    is_stronger = true;
            }

            if (is_stronger) {

                // adds pokemon to array of strongest
                const str_pokemon = {
                    rat: moveset.rat, id: jb_pkm_obj.id,
                    name: jb_pkm_obj.name, form: jb_pkm_obj.form,
                    mega: mega, mega_y: mega_y, shadow: shadow,
                    fm: moveset.fm, fm_type: moveset.fm_type,
                    fm_is_elite: moveset.fm_is_elite,
                    cm: moveset.cm, cm_type: moveset.cm_type,
                    cm_is_elite: moveset.cm_is_elite
                };
                str_pokemons.set(type, str_pokemon);
            }
        }
    }

    // searches for pokemons...

    for (let id = 1; id <= jb_max_id; id++) {

        const forms = GetPokemonForms(id);
        const def_form = forms[0];

        let jb_pkm_obj = jb_pkm.find(entry =>
                entry.id == id && entry.form == def_form);

        // checks whether pokemon should be skipped
        // (not released or legendary when not allowed)
        if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released
                || !search_legendary && jb_pkm_obj.class) {
            continue;
        }

        const can_be_shadow = jb_pkm_obj.shadow;
        const can_be_mega = jb_pkm_obj.mega;

        // default form
        CheckIfStronger(jb_pkm_obj, false, false, false);

        // shadow (except not released when it shouldn't)
        if (search_shadow && can_be_shadow
                && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
            CheckIfStronger(jb_pkm_obj, false, false, true);
        }

        // mega(s)
        if (search_mega && can_be_mega) {
            CheckIfStronger(jb_pkm_obj, true, false, false);
            if (id == 6 || id == 150) // charizard and mewtwo
                CheckIfStronger(jb_pkm_obj, true, true, false);
        }

        // other forms
        for (let form_i = 1; form_i < forms.length; form_i++) {

            jb_pkm_obj = jb_pkm.find(entry =>
                    entry.id == id && entry.form == forms[form_i]);

            // checks whether pokemon should be skipped (form not released)
            if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released)
                continue;

            CheckIfStronger(jb_pkm_obj, false, false, false);
            // other forms and shadow (except not released when it shouldn't)
            if (search_shadow && can_be_shadow
                    && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
                CheckIfStronger(jb_pkm_obj, false, false, true);
            }
        }
    }

    // converts strongest map into array and TYPES set into ranks array
    let str_pokemons_array = [];
    let ranks = [];
    for (const type of POKEMON_TYPES) {
        if (str_pokemons.has(type)) {
            str_pokemons_array.push(str_pokemons.get(type));
            ranks.push(type.toLowerCase());
        }
    }

    // sets table from array
    SetStrongestTableFromArray(str_pokemons_array, ranks);
}

/**
 * Searches the strongest pokemon of any type and sets the strongest
 * pokemon table with the result.
 */
function SetTableOfStrongestOfAnyType(search_unreleased, search_mega,
        search_shadow, search_legendary, search_elite, search_different_type) {

    const num_rows = POKEMON_TYPES.size;

    // array of strongest pokemon and moveset found so far
    let str_pokemons = [];

    /**
     * Checks if the strongest moveset of a specific pokemon is
     * stronger than any of the current strongest pokemons. If it is,
     * updates the strongest pokemons array.
     *
     * The array is sorted every time so that it is always the weakest
     * pokemon in it that gets replaced.
     */
    function CheckIfStronger(jb_pkm_obj, mega, mega_y, shadow) {

        const moveset = GetPokemonStrongestMoveset(jb_pkm_obj,
                mega, mega_y, shadow, search_elite, search_different_type);

        let is_strong_enough = false;

        if (str_pokemons.length < num_rows) { // if array isn't full...

            if (moveset.rat > 0)
                is_strong_enough = true;

        } else { // if array isn't empty...

            // if finds something better than worst in array...
            if (moveset.rat > str_pokemons[0].rat)
                is_strong_enough = true;
        }

        if (is_strong_enough) {

            // adds pokemon to array of strongest
            const str_pokemon = {
                rat: moveset.rat, id: jb_pkm_obj.id,
                name: jb_pkm_obj.name, form: jb_pkm_obj.form,
                mega: mega, mega_y: mega_y, shadow: shadow,
                fm: moveset.fm, fm_type: moveset.fm_type,
                fm_is_elite: moveset.fm_is_elite,
                cm: moveset.cm, cm_type: moveset.cm_type,
                cm_is_elite: moveset.cm_is_elite
            };

            if (str_pokemons.length < num_rows)
                str_pokemons.push(str_pokemon);
            else
                str_pokemons[0] = str_pokemon;

            // sorts array
           str_pokemons.sort(function compareFn(a , b) {
               return ((a.rat > b.rat) || - (a.rat < b.rat));
           });
        }
    }

    // searches for pokemons...

    for (let id = 1; id <= jb_max_id; id++) {

        const forms = GetPokemonForms(id);
        const def_form = forms[0];

        let jb_pkm_obj = jb_pkm.find(entry =>
                entry.id == id && entry.form == def_form);

        // checks whether pokemon should be skipped
        // (not released or legendary when not allowed)
        if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released
                || !search_legendary && jb_pkm_obj.class) {
            continue;
        }

        const can_be_shadow = jb_pkm_obj.shadow;
        const can_be_mega = jb_pkm_obj.mega;

        // default form
        CheckIfStronger(jb_pkm_obj, false, false, false);

        // shadow (except not released when it shouldn't)
        if (search_shadow && can_be_shadow
                && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
            CheckIfStronger(jb_pkm_obj, false, false, true);
        }

        // mega(s)
        if (search_mega && can_be_mega) {
            CheckIfStronger(jb_pkm_obj, true, false, false);
            if (id == 6 || id == 150) // charizard and mewtwo
                CheckIfStronger(jb_pkm_obj, true, true, false);
        }

        // other forms
        for (let form_i = 1; form_i < forms.length; form_i++) {

            jb_pkm_obj = jb_pkm.find(entry =>
                    entry.id == id && entry.form == forms[form_i]);

            // checks whether pokemon should be skipped (form not released)
            if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released)
                continue;

            CheckIfStronger(jb_pkm_obj, false, false, false);
            // other forms and shadow (except not released when it shouldn't)
            if (search_shadow && can_be_shadow
                    && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
                CheckIfStronger(jb_pkm_obj, false, false, true);
            }
        }
    }

    // reverses strongest pokemon array
    str_pokemons.reverse();

    // sets table from array
    SetStrongestTableFromArray(str_pokemons, null, num_rows);
}

/**
 * Searches the strongest pokemon of a specific type and sets the strongest
 * pokemon table with the result.
 * 
 * The number of rows in the table is set to match the table with one
 * pokemon of each type, therefore, there are as many rows as pkm types.
 */
function SetTableOfStrongestOfOneType(search_unreleased, search_mega,
        search_shadow, search_legendary, search_elite, search_different_type, type) {

    const num_rows = POKEMON_TYPES.size;

    // array of strongest pokemon and moveset found so far
    let str_pokemons = [];

    /**
     * Checks if the strongest moveset of a specific pokemon and type is
     * stronger than any of the current strongest pokemons. If it is,
     * updates the strongest pokemons array.
     *
     * The array is sorted every time so that it is always the weakest
     * pokemon in it that gets replaced.
     */
    function CheckIfStronger(jb_pkm_obj, mega, mega_y, shadow) {

        const types_movesets = GetPokemonStrongestMovesetsOfEachType(jb_pkm_obj,
                mega, mega_y, shadow, search_elite, search_different_type, type);
        if (!types_movesets.has(type))
            return;
        const moveset = types_movesets.get(type);

        let is_strong_enough = false;

        if (str_pokemons.length < num_rows) { // if array isn't full...

            if (moveset.rat > 0)
                is_strong_enough = true;

        } else { // if array isn't empty...

            // if finds something better than worst in array...
            if (moveset.rat > str_pokemons[0].rat)
                is_strong_enough = true;

        }

        if (is_strong_enough) {

            // adds pokemon to array of strongest
            const str_pokemon = {
                rat: moveset.rat, id: jb_pkm_obj.id,
                name: jb_pkm_obj.name, form: jb_pkm_obj.form,
                mega: mega, mega_y: mega_y, shadow: shadow,
                fm: moveset.fm, fm_type: moveset.fm_type,
                fm_is_elite: moveset.fm_is_elite,
                cm: moveset.cm, cm_type: moveset.cm_type,
                cm_is_elite: moveset.cm_is_elite
            };

            if (str_pokemons.length < num_rows)
                str_pokemons.push(str_pokemon);
            else
                str_pokemons[0] = str_pokemon;


            // sorts array
           str_pokemons.sort(function compareFn(a , b) {
               return ((a.rat > b.rat) || - (a.rat < b.rat));
           });
        }
    }

    // searches for pokemons...

    for (let id = 1; id <= jb_max_id; id++) {

        const forms = GetPokemonForms(id);
        const def_form = forms[0];

        let jb_pkm_obj = jb_pkm.find(entry =>
                entry.id == id && entry.form == def_form);

        // checks whether pokemon should be skipped
        // (not released or legendary when not allowed)
        if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released
                || !search_legendary && jb_pkm_obj.class) {
            continue;
        }

        const can_be_shadow = jb_pkm_obj.shadow;
        const can_be_mega = jb_pkm_obj.mega;

        // default form
        CheckIfStronger(jb_pkm_obj, false, false, false);

        // shadow (except not released when it shouldn't)
        if (search_shadow && can_be_shadow
                && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
            CheckIfStronger(jb_pkm_obj, false, false, true);
        }

        // mega(s)
        if (search_mega && can_be_mega) {
            CheckIfStronger(jb_pkm_obj, true, false, false);
            if (id == 6 || id == 150) // charizard and mewtwo
                CheckIfStronger(jb_pkm_obj, true, true, false);
        }

        // other forms
        for (let form_i = 1; form_i < forms.length; form_i++) {

            jb_pkm_obj = jb_pkm.find(entry =>
                    entry.id == id && entry.form == forms[form_i]);

            // checks whether pokemon should be skipped (form not released)
            if (!jb_pkm_obj || !search_unreleased && !jb_pkm_obj.released)
                continue;

            CheckIfStronger(jb_pkm_obj, false, false, false);
            // other forms and shadow (except not released when it shouldn't)
            if (search_shadow && can_be_shadow
                    && !(!search_unreleased && !jb_pkm_obj.shadow_released)) {
                CheckIfStronger(jb_pkm_obj, false, false, true);
            }
        }
    }

    // reverses strongest pokemon array
    str_pokemons.reverse();

    // sets table from array
    SetStrongestTableFromArray(str_pokemons, null, num_rows);
}

/**
 * Gets map of a specific pokemon's strongest movesets for each type.
 * 
 * If the 'search_type' param is specified, only tries to find movesets
 * of that type.
 * 
 * However, if 'search_different_type' is true, all other types are allowed but
 * their rating is calculated as if they are not very effective but the selected
 * type is neutral.
 */
function GetPokemonStrongestMovesetsOfEachType(jb_pkm_obj, mega, mega_y, shadow,
        search_elite, search_different_type, search_type = null) {

    let types_movesets = new Map();

    // checks whether this pokemon is actually released,
    // and if not, returns empty

    let released = true && jb_pkm_obj;
    if (mega)
        released = released && jb_pkm_obj.mega;
    if (mega_y)
        released = released && jb_pkm_obj.mega.length == 2;

    if (!released)
        return types_movesets;

    // gets the necessary data to make the rating calculations

    const types = GetPokemonTypes(jb_pkm_obj, mega, mega_y);

    const stats = GetPokemonStats(jb_pkm_obj, mega, mega_y);
    const atk = (shadow) ? (stats.atk * 6 / 5) : stats.atk;
    const def = (shadow) ? (stats.def * 5 / 6) : stats.def;
    const hp = stats.hp;

    const moves = GetPokemongoMoves(jb_pkm_obj);
    if (moves.length != 4)
        return types_movesets;

    const fms = moves[0];
    const cms = moves[1];
    const elite_fms = moves[2];
    const elite_cms = moves[3];

    const all_fms = fms.concat(elite_fms);
    const all_cms = cms.concat(elite_cms);

    // searches for the moveset

    for (fm of all_fms) {

        const fm_is_elite = elite_fms.includes(fm);

        if (!search_elite && fm_is_elite)
            continue;

        // gets the fast move object
        const fm_obj = jb_fm.find(entry => entry.name == fm);
        if (!fm_obj || fm_obj.name == "Hidden Power")
            continue;

        // checks that fm type matches the type searched
        // (is diff types are allowed or search type isn't specified, any type goes)
        if (!search_different_type && search_type && fm_obj.type != search_type)
            continue;

        for (cm of all_cms) {

            const cm_is_elite = elite_cms.includes(cm);

            if (!search_elite && cm_is_elite)
                continue;

            // gets the charged move object
            const cm_obj = jb_cm.find(entry => entry.name == cm);
            if (!cm_obj)
                continue;

            // checks that cm type matches the type searched
            // (is diff types are allowed or search type isn't specified, any type goes)
            if (!search_different_type && search_type && cm_obj.type != search_type)
                continue;

            // checks that both moves types are equal
            // (if diff types are allowed, they don't need to be equal)
            if (!search_different_type && fm_obj.type != cm_obj.type)
                continue;

            // evaluates the movesets for each type that matters and,
            // if they are strong enough, adds them to the map as the strongest
            // moveset of said type

            let moves_types;
            if (search_type)
                moves_types = [ search_type ];
            else if (fm_obj.type == cm_obj.type)
                moves_types = [ fm_obj.type ];
            else
                moves_types = [ fm_obj.type, cm_obj.type ];

            for (let moves_type of moves_types) {

                // calculates the data

                const dps = GetDPS(types, atk, def, hp, fm_obj, cm_obj,
                        ((fm_obj.type == moves_type) ? 1 : 0.625),
                        ((cm_obj.type == moves_type) ? 1 : 0.625));
                const tdo = GetTDO(dps, hp, def);
                // metrics from Reddit user u/Elastic_Space
                let rat = 0;
                if (settings_metric == "ER") {
                    const dps3tdo = Math.pow(dps, 3) * tdo;
                    rat = Math.pow(dps3tdo, 1/4);
                } else if (settings_metric == "EER") {
                    rat = Math.pow(dps, 0.775) * Math.pow(tdo, 0.225);
                } else if (settings_metric == "TER") {
                    rat = Math.pow(dps, 0.85) * Math.pow(tdo, 0.15);
                }

                // checks whether this moveset is the strongest for this type
                // so far and, if it is, overrides the previous strongest
                if (!types_movesets.has(moves_type)
                        || rat > types_movesets.get(moves_type).rat) {
                    const type_moveset = {
                        rat: rat,
                        fm: fm, fm_type: fm_obj.type, fm_is_elite: fm_is_elite,
                        cm: cm, cm_type: cm_obj.type, cm_is_elite: cm_is_elite
                    };
                    types_movesets.set(moves_type, type_moveset);
                }
            }
        }
    }

    return types_movesets;
}

/**
 * Gets a specific pokemon's strongest moveset.
 */
function GetPokemonStrongestMoveset(jb_pkm_obj, mega, mega_y, shadow,
        search_elite, search_different_type) {

    let moveset = {};

    // checks whether this pokemon is actually released,
    // and if not, returns empty

    let released = true && jb_pkm_obj;
    if (mega)
        released = released && jb_pkm_obj.mega;
    if (mega_y)
        released = released && jb_pkm_obj.mega.length == 2;

    if (!released)
        return moveset;

    // gets the necessary data to make the rating calculations

    const types = GetPokemonTypes(jb_pkm_obj, mega, mega_y);

    const stats = GetPokemonStats(jb_pkm_obj, mega, mega_y);
    const atk = (shadow) ? (stats.atk * 6 / 5) : stats.atk;
    const def = (shadow) ? (stats.def * 5 / 6) : stats.def;
    const hp = stats.hp;

    const moves = GetPokemongoMoves(jb_pkm_obj);
    if (moves.length != 4)
        return moveset;

    const fms = moves[0];
    const cms = moves[1];
    const elite_fms = moves[2];
    const elite_cms = moves[3];

    const all_fms = fms.concat(elite_fms);
    const all_cms = cms.concat(elite_cms);

    // searches for the moveset

    for (fm of all_fms) {

        const fm_is_elite = elite_fms.includes(fm);

        if (!search_elite && fm_is_elite)
            continue;

        // gets the fast move object
        const fm_obj = jb_fm.find(entry => entry.name == fm);
        if (!fm_obj || fm_obj.name == "Hidden Power")
            continue;

        for (cm of all_cms) {

            const cm_is_elite = elite_cms.includes(cm);

            if (!search_elite && cm_is_elite)
                continue;

            // gets the charged move object
            const cm_obj = jb_cm.find(entry => entry.name == cm);
            if (!cm_obj)
                continue;

            // checks that both moves types are equal
            // (if diff types are allowed, they don't need to be equal)
            if (!search_different_type && fm_obj.type != cm_obj.type)
                continue;

            // calculates the data

            const dps = GetDPS(types, atk, def, hp, fm_obj, cm_obj);
            const tdo = GetTDO(dps, hp, def);
            // metrics from Reddit user u/Elastic_Space
            let rat = 0;
            if (settings_metric == "ER") {
                const dps3tdo = Math.pow(dps, 3) * tdo;
                rat = Math.pow(dps3tdo, 1/4);
            } else if (settings_metric == "EER") {
                rat = Math.pow(dps, 0.775) * Math.pow(tdo, 0.225);
            } else if (settings_metric == "TER") {
                rat = Math.pow(dps, 0.85) * Math.pow(tdo, 0.15);
            }

            // checks whether this moveset is stronger than current strongest,
            // if it is, overrides the previous strongest
            if (!moveset.rat || rat > moveset.rat) {
                moveset = {
                    rat: rat,
                    fm: fm, fm_type: fm_obj.type, fm_is_elite: fm_is_elite,
                    cm: cm, cm_type: cm_obj.type, cm_is_elite: cm_is_elite
                };
            }
        }
    }

    return moveset;
}

/**
 * Adds rows to the strongest pokemon table according to an array of
 * pokemon. The 'ranks' array fills the leftmost column of the table,
 * if nothing is sent, is filled with ordered numbers #1, #2, etc.
 *
 * If a number of rows is specified and there aren't enough pokemon, fills 
 * the remaining rows with "-". If the number of rows isn't specified,
 * there will be as many rows as pokemon in the array.
 */
function SetStrongestTableFromArray(str_pokemons, ranks = null, num_rows = null) {

    if (!num_rows)
        num_rows = str_pokemons.length;

    for (let row_i = 0; row_i < num_rows; row_i++) {

        if (row_i < str_pokemons.length) {

            let rank = "#" + (row_i + 1);
            if (ranks && ranks[row_i])
                rank = ranks[row_i];

            const p = str_pokemons[row_i];

            const name = p.name;
            const coords = GetPokemonIconCoords(p.id, p.form, p.mega, p.mega_y);
            const can_be_mega_y = p.id == 6 || p.id == 150; 
            const primal = p.mega && (p.id == 382 || p.id == 383);
            const form_text = GetFormText(p.id, p.form);

            const tr = $("<tr></tr>");
            const td_rank = "<td class='off small-text'>" + rank + "</td>";
            const td_name = "<td>"
                + "<a class='' onclick='LoadPokemonAndUpdateURL(" + p.id
                + ",\"" + p.form + "\"," + p.mega + "," + p.mega_y + ")'>"
                + "<span class=pokemon-icon style='background-image:url("
                + ICONS_URL + ");background-position:" + coords.x + "px "
                + coords.y + "px'></span>"
                + " <span class='strongest-name'>"
                + ((primal) ? ("Primal ") : ((p.mega) ? "Mega " : ""))
                + ((p.shadow)
                    ? "<span class=shadow-text>Shadow</span> " : "")
                + name
                + ((p.mega && can_be_mega_y)
                    ? ((p.mega_y) ? " Y" : " X") : "")
                + "</span>"
                + ((form_text.length > 0)
                    ? " <span class=small-text>(" + form_text + ")</span>" 
                    : "")
                + "</a></td>";
            const td_fm =
                "<td><span class='type-text bg-"
                + ((p.fm == "Hidden Power") ? "any-type" : p.fm_type) + "'>"
                + p.fm + ((p.fm_is_elite) ? "*" : "") + "</span></td>";
            const td_cm =
                "<td><span class='type-text bg-" + p.cm_type + "'>"
                + p.cm + ((p.cm_is_elite) ? "*" : "") + "</span></td>";
            const td_rat = "<td>" + settings_metric + " <b>"
                + p.rat.toFixed(2) + "</b></td>";

            tr.append(td_rank);
            tr.append(td_name);
            tr.append(td_fm);
            tr.append(td_cm);
            tr.append(td_rat);

            $("#strongest-table").append(tr);

        } else {

            const empty_row =
                "<tr><td>-</td><td>-</td><td>-</td><td>-</td></tr>"
            $("#strongest-table").append(empty_row);
        }
    }
}

/**
 * Makes string clean, all lowercases and only alphanumeric characters.
 */
function Clean(string) {

    return string.toLowerCase().replace(/\W/g, "");
}
