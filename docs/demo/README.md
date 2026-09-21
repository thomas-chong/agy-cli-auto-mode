# Live trace animation

This composition visualizes the sanitized live trace in [`trace.json`](trace.json). The captured values came from real TypeSafe System One requests; credentials and raw transcripts are not stored.

## Refresh the trace

This makes two potentially billable, non-retried Jev calls:

```sh
npm run trace:live
```

Review `trace.json`, then update the displayed values in `index.html` if the model result changed.

## Validate and render

Requires Node.js 22+, Chrome, FFmpeg, and the HyperFrames CLI (invoked through `npx`):

```sh
npx hyperframes lint docs/demo --verbose
npx hyperframes check docs/demo --at 0.5,2.5,4.2,6.5,7.8
npx hyperframes render docs/demo \
  --format gif \
  --fps 15 \
  --gif-loop 0 \
  --quality looks \
  --workers 2 \
  --output /tmp/jev-auto-mode-trace-raw.gif

# Flatten GIF transparency onto the composition's dark canvas and optimize it.
ffmpeg -y -i /tmp/jev-auto-mode-trace-raw.gif \
  -filter_complex "color=c=0x06101f:s=960x540:r=15:d=8[bg];[0:v]format=rgba[fg];[bg][fg]overlay=shortest=1,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=sierra2_4a" \
  assets/jev-auto-mode-trace.gif
```

The HTML composition is the editable source. HyperFrames deterministically captures its timeline; FFmpeg only flattens the 1-bit GIF transparency and optimizes the palette for reliable GitHub light/dark rendering.
