# Debug Page Selector - What to Check

## When You Click "Choose Pages" Button

You should see these console logs in order:

### 1. Button Click Logs
```
[Dashboard] ===== BUTTON CLICKED =====
[Dashboard] Current showPageSelector: false
[Dashboard] storePages: Array(34) [...]
[Dashboard] storePages.length: 34
[Dashboard] pageTypeOptions: Array(34) [...]
[Dashboard] pageTypeOptions.length: 34
[Dashboard] isLoadingPages: false
[Dashboard] mounted: true
[Dashboard] Filtered pages (without "all"): Array(33) [...]
[Dashboard] Filtered pages count: 33
[Dashboard] Setting showPageSelector to TRUE
[Dashboard] After setState, showPageSelector should be true
```

### 2. State Change Log
```
[Dashboard] showPageSelector changed to: true
```

### 3. PageSelector Modal Logs
```
[PageSelector] Modal opened with 33 available pages
[PageSelector] Initial selected: []
```

## If Modal Doesn't Open

Check these things:

### 1. Is `mounted` true?
- If false, the PageSelector won't render
- Wait a moment after page load

### 2. Is `storePages.length` > 0?
- If 0, button will be disabled
- Check earlier logs for page loading

### 3. Is `showPageSelector` actually changing to true?
- Look for the state change log
- If missing, there's a React state issue

### 4. Are there any React errors in console?
- Red errors will prevent modal from rendering
- Check for hydration mismatches

## Expected Behavior

1. **Button appears**: "Choose Pages (34 available)"
2. **Click button**: Console logs appear
3. **Modal opens**: Full-screen modal with page list
4. **Can select pages**: Checkboxes work
5. **Can search**: Filter input works
6. **Can save**: "Add" button enabled after selection

## If Still Not Working

Try these steps:

1. **Hard refresh**: Ctrl+Shift+R (Windows) or Cmd+Shift+R (Mac)
2. **Clear cache**: Clear browser cache and reload
3. **Check network**: Look for failed API calls in Network tab
4. **Check React DevTools**: Inspect component state

## Common Issues

### Issue: Button is disabled
**Solution**: Wait for pages to load (check `isLoadingPages`)

### Issue: Button shows "No pages available"
**Solution**: Check API logs for `/api/shopify-pages` errors

### Issue: Modal opens but empty
**Solution**: Check `availablePages` prop - should have 33 items

### Issue: Can't select pages
**Solution**: Check checkbox onChange handlers in PageSelector

### Issue: "Add" button doesn't work
**Solution**: Check `onSelectPages` callback in dashboard
