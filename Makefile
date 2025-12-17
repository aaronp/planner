.PHONY: dev build preview install clean

dev:
	bun run dev

build:
	bun run build

preview:
	bun run preview

install:
	bun install

clean:
	rm -rf node_modules dist
