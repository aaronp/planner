# Venture Plan

A React web application built with Bun, Vite, and TypeScript.

## Prerequisites

- [Bun](https://bun.sh/) (latest version)

## Getting Started

### Install Dependencies

```bash
make install
# or
bun install
```

### Development

Run the development server:

```bash
make dev
```

The app will be available at `http://localhost:5173`

### Build

Build the production bundle:

```bash
make build
# or
bun run build
```

### Preview

Preview the production build locally:

```bash
make preview
# or
bun run preview
```

## Deployment

This project is configured to automatically deploy to GitHub Pages when changes are pushed to the `master` branch.

### Setting Up GitHub Pages

1. Go to your repository settings on GitHub
2. Navigate to Pages (under "Code and automation")
3. Under "Build and deployment", set Source to "GitHub Actions"
4. Push to the `master` branch to trigger deployment

The site will be available at: `https://<username>.github.io/ui-skeleton/`

## Makefile Targets

- `make dev` - Start development server
- `make build` - Build production bundle
- `make preview` - Preview production build
- `make install` - Install dependencies
- `make clean` - Remove node_modules and dist directories

## Tech Stack

- **Runtime**: Bun
- **Framework**: React 18
- **Build Tool**: Vite
- **Language**: TypeScript
- **Deployment**: GitHub Pages via GitHub Actions
