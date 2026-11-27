# Adaguc Workbench (AWB)

Browser-based viewer for WMS/WCS geospatial data, built for use with [Adaguc-Server](https://github.com/KNMI/adaguc-server) WMS services. For developers integrating or testing services, researchers visualizing datasets, and anyone building new WMS layers who needs a quick way to check rendering, styles, dimensions and legends.

This project is also used as the viewer in [Adaguc-Server](https://github.com/KNMI/adaguc-server)'s own Docker Compose setup, served at the `/explorer` path.

![Adaguc Workbench screenshot](docs/screenshot.jpg)

**Live demo:** https://knmi.github.io/adaguc-workbench/

Open a Adaguc AutoWMS service directly by passing it on the URL, e.g.
[`?autowms=https://geoservices.knmi.nl/autowms`](https://knmi.github.io/adaguc-workbench/?autowms=https://geoservices.knmi.nl/autowms).
A URL-encoded WMS `GetCapabilities` link works too:
[`?autowms=https%3A%2F%2Fgeoservices.knmi.nl%2Fadagucserver%3Fdataset%3D10-minute-in-situ-meteorological-observations%26SERVICE%3DWMS%26REQUEST%3DGetCapabilities`](https://knmi.github.io/adaguc-workbench/?autowms=https%3A%2F%2Fgeoservices.knmi.nl%2Fadagucserver%3Fdataset%3D10-minute-in-situ-meteorological-observations%26SERVICE%3DWMS%26REQUEST%3DGetCapabilities).

## Quick start

```bash
nvm use   # Node 26, from .nvmrc
npm ci
npm start   # http://localhost:4000
```

## Scripts

| Command                 | Purpose                                                   |
| ----------------------- | --------------------------------------------------------- |
| `npm start`             | Vite dev server with hot reload                           |
| `npm run build`         | Type check, then production build → `dist/`               |
| `npm run preview`       | Serve the production build from `dist/`                   |
| `npm test`              | Run the test suite (Vitest); `npm run test:watch` to watch |
| `npm run lint`          | Prettier + ESLint                                         |
| `npm run storybook`     | Component storybook (uses `stories/`)                     |

## Built with

This project is built on top of the [OpenGeoWeb](https://www.npmjs.com/org/opengeoweb) packages, in particular [`@opengeoweb/webmap-react`](https://www.npmjs.com/package/@opengeoweb/webmap-react) (the React map components), along with [`@opengeoweb/webmap`](https://www.npmjs.com/package/@opengeoweb/webmap) and [`@opengeoweb/theme`](https://www.npmjs.com/package/@opengeoweb/theme).

## Docker

Prebuilt images are published to Docker Hub as [`knmiadaguc/adaguc-workbench`](https://hub.docker.com/r/knmiadaguc/adaguc-workbench):

```bash
docker run -it -p 8080:80 \
  -e ADAGUC_AUTOWMS_ENDPOINT=https://geoservices.knmi.nl/autowms \
  knmiadaguc/adaguc-workbench:main
# → http://localhost:8080
```

Or build locally:

```bash
docker build . -t adaguc-workbench
docker run -it -p 8080:80 \
  -e ADAGUC_AUTOWMS_ENDPOINT=https://geoservices.knmi.nl/autowms \
  adaguc-workbench
```

### Environment variables

All optional, and applied when the container starts:

| Variable | Default | Sets |
| --- | --- | --- |
| `ADAGUC_AUTOWMS_ENDPOINT` | `http://localhost:8090/adaguc-services/autowms?` | The AutoWMS server the viewer starts with. See [Setting the default AutoWMS server](#setting-the-default-autowms-server). |
| `ADAGUCSERVICES_AUTOWMS` | _(none)_ | The same, under the name older setups use. Only used when `ADAGUC_AUTOWMS_ENDPOINT` isn't set. |
| `BASE_PATH` | `/` | The path the viewer is served under, e.g. `/workbench/`. See [Serving under a path](#serving-under-a-path). |

The container serves the viewer over HTTP on port 80, with gzip compression.

### Setting the default AutoWMS server

The `ADAGUC_AUTOWMS_ENDPOINT` environment variable sets which AutoWMS server the viewer starts with. That server:

- opens in the AutoWMS panel when the page loads, and
- is always the first suggestion in both "add a WMS or AutoWMS service" fields.

```bash
docker run -it -p 8080:80 \
  -e ADAGUC_AUTOWMS_ENDPOINT=https://my-server.example.com/autowms? \
  knmiadaguc/adaguc-workbench:main
```

Or with Docker Compose:

```yaml
services:
  workbench:
    image: knmiadaguc/adaguc-workbench:main
    ports:
      - '8080:80'
    environment:
      ADAGUC_AUTOWMS_ENDPOINT: https://my-server.example.com/autowms?
```

Things to know:

- **The user's browser fetches this url, not the container.** It must be reachable from the machine the viewer is opened on, so `localhost` there means the user's own computer, not the container or the Docker host.
- **The value can be:**
  - an AutoWMS endpoint, e.g. `https://geoservices.knmi.nl/autowms?`;
  - just the server's address, e.g. `https://geoservices.knmi.nl`: the viewer then tries `…/autowms` and `…/adaguc-server/autowms` itself;
  - a WMS url, whose layers are then listed straight away.
- **Without the variable** the image uses `ADAGUCSERVICES_AUTOWMS` if that is set (the name older setups use), and otherwise `http://localhost:8090/adaguc-services/autowms?`, the address in a local [Adaguc-Server](https://github.com/KNMI/adaguc-server) setup.
- **How it works:** on every start, the container writes the value into the site's `config.json` as `{"autowmsurl": "…"}`, and the viewer reads that file when the page loads. So change the variable and restart the container; mounting your own `config.json` doesn't work, because it's overwritten at start.
- **For a single visit**, a link can open another service instead with `?autowms=<url>` (see the examples at the top).

Without Docker, for example a `npm run build` served by your own web server, set the same `autowmsurl` in [`static/config.json`](static/config.json) before building, or edit `config.json` in `dist/` afterwards.

### Serving under a path

By default the viewer is served at the root, `/`. To serve it under a path instead, for example behind a reverse proxy that sends `/workbench/` to this container, set `BASE_PATH`:

```bash
docker run -it -p 8080:80 \
  -e BASE_PATH=/workbench/ \
  knmiadaguc/adaguc-workbench:main
# → http://localhost:8080/workbench/
```

- The slashes are optional: `workbench`, `/workbench` and `/workbench/` all serve it under `/workbench/`.
- `/workbench` without the trailing slash redirects to `/workbench/`.
- Addresses outside the path give "not found".
- The site refers to its own files relatively, so it needs no rebuild for a path.
- A reverse proxy in front should pass the path on unchanged, not strip it: the container expects requests for `/workbench/…`.
