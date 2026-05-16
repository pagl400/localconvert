# LocalConvert

Universal on-device file converter for iOS and Android.
100 % local · No cloud · No tracking · No ads.

See [SPEC.md](./SPEC.md) for the full build specification.

## Develop

```bash
pnpm install

# Custom dev client (required for audio / video / native PDF — see docs/dev-client-setup.md)
pnpm ios       # one-time native build, then auto-reload
pnpm android
```

See [docs/dev-client-setup.md](./docs/dev-client-setup.md) for full
details. The development build is **fully local** — no server, no
upload, conversion still runs entirely on the device.

## Legal

- [Privacy Policy](./docs/privacy.md)
- [Impressum](./docs/impressum.md)
