.PHONY: dev build preview install clean rename

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

rename:
	@echo "Current repository name: ui-skeleton"
	@echo "Enter new repository name (kebab-case, e.g., my-app):"
	@read -r NEW_NAME; \
	if [ -z "$$NEW_NAME" ]; then \
		echo "Error: Name cannot be empty"; \
		exit 1; \
	fi; \
	TITLE_NAME=$$(echo "$$NEW_NAME" | sed -E 's/-/ /g' | sed -E 's/\b(.)/\U\1/g'); \
	echo ""; \
	echo "Will rename:"; \
	echo "  - Repository name: ui-skeleton -> $$NEW_NAME"; \
	echo "  - Display name: UI Skeleton -> $$TITLE_NAME"; \
	echo ""; \
	echo "Files to update:"; \
	echo "  - package.json"; \
	echo "  - vite.config.ts"; \
	echo "  - index.html"; \
	echo "  - src/App.tsx"; \
	echo "  - readme.md"; \
	echo ""; \
	read -p "Proceed? (y/N) " -r CONFIRM; \
	if [ "$$CONFIRM" != "y" ] && [ "$$CONFIRM" != "Y" ]; then \
		echo "Cancelled."; \
		exit 0; \
	fi; \
	echo ""; \
	echo "Updating files..."; \
	sed -i.bak "s|ui-skeleton|$$NEW_NAME|g" package.json vite.config.ts readme.md && rm -f package.json.bak vite.config.ts.bak readme.md.bak; \
	sed -i.bak "s|UI Skeleton|$$TITLE_NAME|g" src/App.tsx && rm -f src/App.tsx.bak; \
	sed -i.bak "s|Venture Plan|$$TITLE_NAME|g" index.html readme.md && rm -f index.html.bak readme.md.bak; \
	echo "✓ Updated package.json"; \
	echo "✓ Updated vite.config.ts"; \
	echo "✓ Updated index.html"; \
	echo "✓ Updated src/App.tsx"; \
	echo "✓ Updated readme.md"; \
	echo ""; \
	echo "Reinstalling dependencies..."; \
	bun install; \
	echo ""; \
	echo "✅ Rename complete!"; \
	echo ""; \
	echo "Next steps:"; \
	echo "  1. Review the changes: git diff"; \
	echo "  2. Test locally: make dev"; \
	echo "  3. Commit changes: git add . && git commit -m 'Rename project to $$NEW_NAME'"; \
	echo "  4. Push to trigger deployment: git push"
