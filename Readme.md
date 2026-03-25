# ☕ Grounds & Glory — A Personal Coffee Journal

> *A personal pursuit of the perfect cup.*

A beautiful, searchable coffee journal built as a static GitHub Pages site. Track your gear, roasters, daily tasting notes, grind settings, brewing recipes, and more.

**Live site:** https://rathialok901.github.io/coffee-fever

---

## Features

- 📓 **Tasting Journal** — Log every cup with grind settings, brew method, structured scores (acidity, body, sweetness, finish), taste tags, and free-text notes
- 🏭 **Roasters** — Track roasters you're exploring, with details auto-fetched on addition
- 🔧 **My Gear** — Visual showcase of all your brewing equipment
- 📋 **Recipes** — Dialled-in recipes for every brewer with step-by-step instructions and K-Ultra click settings
- 📊 **Stats Dashboard** — Visual breakdown of methods, taste profiles, and roast levels
- 🔍 **Global Search** — Search across everything instantly
- 🎯 **Filters** — Filter journal by roaster, roast level, brew method, and taste profile

---

## 🚀 Setup Instructions

### 1. Enable GitHub Pages

1. Go to your repo → **Settings** → **Pages**
2. Under **Source**, select **GitHub Actions**
3. Save

### 2. Enable Workflow Permissions

1. Go to **Settings** → **Actions** → **General**
2. Under **Workflow permissions**, select **Read and write permissions**
3. Check **Allow GitHub Actions to create and approve pull requests**
4. Save

### 3. Push this repo

```bash
git init
git add .
git commit -m "🚀 Initial commit — Grounds & Glory coffee journal"
git branch -M main
git remote add origin https://github.com/rathialok901/coffee-fever.git
git push -u origin main
```

Your site will be live at **https://rathialok901.github.io/coffee-fever** within ~2 minutes.

---

## 📓 Logging a Journal Entry

### On your phone or laptop:

1. Go to **[Issues → New Issue](https://github.com/rathialok901/coffee-fever/issues/new/choose)**
2. Select **"☕ Log a Journal Entry"**
3. Fill in the form — bean name, roaster, grind, brew method, scores, notes
4. Submit the issue
5. GitHub Actions auto-parses it, commits to `data/journal.json`, and closes the issue
6. Your site rebuilds automatically and shows the new entry ✅

---

## 🏭 Adding a New Roaster

1. Go to **[Issues → New Issue](https://github.com/rathialok901/coffee-fever/issues/new/choose)**
2. Select **"🏭 Add a New Roaster"**
3. Fill in the roaster details
4. Submit — it's automatically added to `data/roasters.json` and appears on the site

---

## 📁 Data Files

All data lives in the `/data` folder as plain JSON — easy to edit manually too:

| File | Contents |
|---|---|
| `data/journal.json` | All tasting entries |
| `data/roasters.json` | Roasters you've added |
| `data/gear.json` | Your brewing equipment |
| `data/recipes.json` | Brewing recipes |

---

## 🔧 Your Gear

| Tool | Type | Grind Range |
|---|---|---|
| Hario V60 | Pour Over | Medium-Fine |
| French Press | Immersion | Coarse |
| Moka Pot | Stovetop | Fine |
| Clever Dripper | Hybrid | Medium |
| South Indian Filter | Traditional | Very Fine |
| 1Zpresso K-Ultra | Hand Grinder | 1–48 clicks |

---

## ☕ Roasters

- **Blue Tokai** — Single-origin Indian estates
- **Coffeeverse** — Experimental specialty
- **Humble Bean** — Boutique, approachable

Add more via GitHub Issues anytime.

---

*Built with love for coffee and code.*
