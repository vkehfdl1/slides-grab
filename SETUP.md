# Setup

Copy-paste installation guide for `slides-grab`.

## 1) Clone the Repository

```bash
git clone https://github.com/vkehfdl1/slides-grab.git && cd slides-grab
```

## 2) Install Dependencies

```bash
npm ci && npx playwright install chromium
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

## 3) Verify CLI

```bash
npm exec -- slides-grab --help
```

Optional Figma export smoke test:

```bash
npm exec -- slides-grab figma --slides-dir slides --output slides-figma.pptx
```

## 4) For Codex Users

Install Codex skills after cloning:

```bash
npm exec -- slides-grab install-codex-skills --force
```

Then restart Codex.
