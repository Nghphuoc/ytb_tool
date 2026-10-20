# Remotion video

<p align="center">
  <a href="https://github.com/remotion-dev/logo">
    <picture>
      <source media="(prefers-color-scheme: dark)" srcset="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-dark.apng">
      <img alt="Animated Remotion Logo" src="https://github.com/remotion-dev/logo/raw/main/animated-logo-banner-light.gif">
    </picture>
  </a>
</p>

Welcome to your Remotion project!

## Commands

**Install Dependencies**

```console
npm i --loglevel=error
```

**Start Preview**

```console
npm run dev
```

**Render video**

```console
npx remotion render
```

**Upgrade Remotion**

```console
npx remotion upgrade
```

## Automated Shorts Pipeline

Run `npm run auto` to generate a script, AI narration, AI-generated scene
videos, and render a Short. Scene videos are generated with Gemini; the pipeline
does not download or cut footage from YouTube or other video platforms.

Set `GEMINI_API_KEY` for script/video generation. The video model defaults to
`gemini-omni-1.1-flash`; set `GEMINI_VIDEO_MODEL` to override it. If
`LLM_PROVIDER=claude`, set `ANTHROPIC_API_KEY` as well. Set `ELEVENLABS_API_KEY`
only when narration is enabled.
Video generation requires a Gemini API project with available quota for the
selected video model. Some models have no Free Tier quota; enable billing or
upgrade the project tier if the API returns a 429 quota error. Check the
project's limits at <https://ai.google.dev/gemini-api/docs/rate-limits>.

The background music and sound effects are optional local assets. Add music as
`public/audio/bgm_suspense.mp3` or `public/audio/bgm_cute.mp3`; missing music is
skipped. If AI video generation fails for any scene, the pipeline stops rather
than substituting downloaded or stale footage.

## Docs

Get started with Remotion by reading the [fundamentals page](https://www.remotion.dev/docs/the-fundamentals).

## Help

We provide help on our [Discord server](https://discord.gg/6VzzNDwUwV).

## Issues

Found an issue with Remotion? [File an issue here](https://github.com/remotion-dev/remotion/issues/new).

## License

Note that for some entities a company license is needed. [Read the terms here](https://github.com/remotion-dev/remotion/blob/main/LICENSE.md).
