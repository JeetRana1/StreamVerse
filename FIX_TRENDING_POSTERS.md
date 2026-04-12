# Fix for Trending Now Poster Changes

The issue is that `hydrateGridCard` is replacing good TMDB posters with different ones fetched from providers.

## Solution: Disable hydration for trending items

In `script.js`, find the `displayGrid` function and add a check to skip hydration for trending section:

Look for this line in `displayGrid`:
```javascript
hydrationObserver.observe(card);
```

Change it to:
```javascript
// Skip hydration for trending section to preserve TMDB posters
if (container === trendingGrid) {
    card.dataset.skipHydration = 'true';
} else {
    hydrationObserver.observe(card);
}
```

Then in the `hydrateGridCard` function, add this at the very beginning:
```javascript
// Skip hydration if marked
if (card.dataset.skipHydration === 'true') return;
```

This will prevent the poster from being overwritten for trending cards while keeping the original TMDB poster.
