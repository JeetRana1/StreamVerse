import sys
import re

known_top_level = [
    "fetchJsonWithApiFallback", "setLoader", "hideLoader", "showError", "hideError",
    "normalizeAudioToken", "getTrackAudioTokens", "rememberAudioPreference",
    "rememberProviderPreference", "updateEpisodeUrlState", "getInitialTvPositionFromUrl",
    "buildTvSeasonsFromInfo", "buildAnimeFillerSlugCandidates", "parseEpisodeRangeToken",
    "parseEpisodeListFromLine", "parseAnimeFillerMapFromText", "parseEpisodeValueToList",
    "parseFillerMapFromJsonPayload", "fetchGithubFillerMap", "normalizeTitleForMatch",
    "fetchTextWithFallbacks", "fetchJsonWithFallbacks", "fetchAnimeFillerIndexEntries",
    "pickBestFillerIndexSlug", "toArrayPayload", "pickBestMalSearchResult",
    "fetchAnimeFillerStatusMap", "getAnimeProviderBase", "buildAnimeInfoUrl",
    "buildAnimeWatchUrl", "getAnimeSearchResults", "getPreferredMediaYear",
    "getAnimeSearchTerms", "pickAnimeResultByTitle", "fetchAnimeSourcesByProvider",
    "fetchSourcesFromGoku", "fetchSources", "playSource", "proxiedStreamUrl",
    "loadStream", "changeQuality", "initCustomControls", "bindVideoEvents",
    "toggleSourcePanel", "toggleEpPanel", "toggleAudioPanel", "updateAudioTracks",
    "switchHlsSourceSilent", "initPLYR", "applyExternalSubtitlesToVideo",
    "resolveSubtitleTrackSrc", "updateCaptionsButtonVisibility", "buildCaptionsMenu",
    "toggleCaptions", "init", "initTv", "playTvEp", "buildEpPanel",
    "updateEpUI", "getNextEpisodeRef", "updateNextEpisodeButton", "goToNextEpisode"
]

def fix_file(path):
    with open(path, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    out_lines = []
    brace_stack = 0
    
    # We'll use a simple heuristic: 
    # If a line contains "async function NAME" or "function NAME" and NAME is in known_top_level,
    # we should be at brace_stack 0 (or inside a very specific wrapper if there was one, but here there isn't).
    
    # First, let's fix the stray 'async' words which often precede 'async function' in the corrupted file
    fixed_lines = []
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        if line == "async" and i + 1 < len(lines) and "async function" in lines[i+1]:
            i += 1 # skip the stray 'async'
        fixed_lines.append(lines[i])
        i += 1
    
    lines = fixed_lines
    
    new_lines = []
    brace_stack = 0
    
    for line in lines:
        stripped = line.strip()
        if not stripped:
            new_lines.append("\n")
            continue
            
        # If this is a known top-level function, close everything before it
        match = re.search(r'^(?:async\s+)?function\s+([a-zA-Z0-9_]+)\s*\(', stripped)
        if match:
            func_name = match.group(1)
            if func_name in known_top_level:
                while brace_stack > 0:
                    new_lines.append("}\n")
                    brace_stack -= 1
        
        new_lines.append(stripped + "\n")
        
        # Simple brace counting (ignoring strings for now as they are rare in this file's structure)
        brace_stack += stripped.count('{')
        brace_stack -= stripped.count('}')
        if brace_stack < 0: brace_stack = 0

    # Re-indentation pass
    final_lines = []
    level = 0
    for line in new_lines:
        s = line.strip()
        if not s:
            final_lines.append("\n")
            continue
            
        if s.startswith('}') or s.startswith(']'):
            level = max(0, level - 1)
            
        final_lines.append("    " * level + s + "\n")
        
        level += s.count('{')
        level -= s.count('}')
        level = max(0, level)

    with open(path + '.fixed', 'w', encoding='utf-8') as f:
        f.writelines(final_lines)

fix_file(r'c:\Users\Jeet\Music\WTEHMOVIESCONSUMETAPITEST\temp.js')
