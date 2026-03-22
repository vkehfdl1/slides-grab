# Setup

Copy-paste installation guide for `slides-grab`.

## 1) Install the npm Package

```bash
npm install slides-grab
```

## 2) Install Browser Dependency

```bash
npx playwright install chromium
```

### Platform-specific: install Node.js first if needed

macOS (Homebrew):

```bash
brew update && brew install node git
```

Ubuntu (apt):

```bash
sudo apt-get update && sudo apt-get install -y curl git && curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs
```

Windows (winget, PowerShell):

```powershell
winget install -e --id OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements; winget install -e --id Git.Git --accept-package-agreements --accept-source-agreements
```

## 3) Install Shared Agent Skills

```bash
npx skills add ./node_modules/slides-grab -g -a codex -a claude-code --yes --copy
```

## 4) Verify CLI

```bash
npm exec -- slides-grab --help
```

Package-install setup verification ends here. Real slide-processing commands such as `slides-grab edit`, `slides-grab convert`, and `slides-grab pdf` need an existing deck directory with `slide-*.html` files. Use `decks/<deck-name>/` or `slides/` only after you have created a deck there.

## 5) Developer / Repo Clone Path

If you want to modify `slides-grab` itself:

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
npm ci
npx playwright install chromium
npx skills add . -g -a codex -a claude-code --yes --copy
```
