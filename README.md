# Expat Financial Planner

**A free, private budget planner for people who earn in one currency and live in another.**

*Built by an expat, for expats. The author has lived in Egypt, the Philippines and Malaysia, and made this app to handle the everyday problem of earning in one currency and spending in another.*

You get paid in dollars, pounds or euros, and you pay rent and buy groceries in pesos, baht, euros or something else. Most budget apps only handle one currency, so you end up doing the sums in your head. Expat Financial Planner shows every amount in both currencies at the live exchange rate. It runs on your own Google Sheet, so your money data stays in your own Google account.

It also uses **AI**: Claude can read your bank statements, sort each transaction into the right category, and write you a short plain-English check-in on how your pay cycle is going.

![Home screen on a computer](docs/home-desktop.png)

*Screenshots use made-up sample data.*

## What it does

- **Every payment locked to the real exchange rate.** When you live on one currency and pay bills in another, the exchange rate changes every day, and most budget apps quietly redo your old spending at today's rate. That makes the numbers shift under you, so you never know what you really spent. Expat Financial Planner fixes this. Each transaction is saved with Wise's exchange rate on the day it happened, along with the exact amount in both currencies. That rate stays with it forever. If you pay ₱25,000 rent this month at one rate and ₱25,000 next month at another, the app shows both: the same pesos, but different dollar costs. It also tells you how much the rate change cost or saved you. Your totals add up what you actually paid, not a guess. Today's rate is only used for the money you have now and for planning ahead. So you always know how much is coming in, how much is going out, and what the currency is really doing to your budget, without guesswork.
- **Add spending in seconds.** You don't have to fill in a form field by field. Just type or say what you spent, in your own words, for example "lunch at the market 350 pesos" or "Grab ride 180". The app picks out the amount, the currency and the category, and fills in the form for you. Check it, press Save, and you're done. This makes it easy to keep your spending up to date every day, even on your phone.
- **Two currencies everywhere.** Every amount shows your home currency with your local currency beside it, for example `$120.00 (€111)`. It uses the live rate from Wise, updated every 15 minutes, for what you have now, and the locked rate of the day for everything you've already spent.
- **Money you have now.** Type what's in each account once (bank, Wise, local bank, e-wallet, cash). Each account can be in its own currency. After that, every expense and transfer you add is taken off automatically, so Home always shows what you have left and how much you can spend per day until your next pay day.
- **Budgets that follow your pay day.** Your budget "month" runs from the day your income arrives, not from the 1st. Each budget can be in either currency, so rent can be set in local money and stay exact whatever the exchange rate does.
- **Warnings before you overspend.** You get alerts at 50%, 75% and 100% of each budget, plus a warning if your day-to-day spending pace is ahead of plan.
- **Upload bank statements.** Drop in a CSV or PDF statement and the transactions are added for you. Duplicates are skipped. There is a dedicated reader for **Wise** PDF statements: it handles card holds that get released, refunds, fees and currency conversions.
- **Claude checks your categories.** After an upload, Claude reviews each transaction and fixes the wrong ones. For example, it moves a ride-hailing trip from "Other" to "Transport", or changes money you moved between your own accounts from "spending" to a "transfer".
- **AI money check-in.** One button asks Claude for a short, simple summary: how the cycle is going, what to watch, and a safe daily amount until pay day.
- **Easy to use.** Large text, a text-size control, light and dark colours, a "read summary out loud" button and a button to hide all amounts. It works on a phone or a computer.

| Phone | Add an expense | Settings |
|---|---|---|
| ![Home on a phone](docs/home-phone.png) | ![Add screen](docs/add.png) | ![Settings](docs/settings.png) |

## Set it up (about 10 minutes)

**Shortcut: let Claude set it up for you.** If you'd rather skip the setup, open Claude with a browser tool connected (for example Claude in Chrome), give it the link to this page, and say: *"Deploy this Expat Financial Planner for me with my details."* Then tell it what it needs: your home and local currencies, your pay day, your income, your accounts and your budgets. Claude can do the steps below for you. You'll still sign in to Google yourself, and you'll paste your own Claude API key yourself.

You need a Google account. A Claude API key is optional, and you only need one for the AI features.

1. **Make a new Google Sheet.** Go to [sheets.new](https://sheets.new) and give it a name, for example "My Budget".
2. **Open the script editor.** In the sheet's menu, choose **Extensions → Apps Script**.
3. **Add the server code.** Delete everything in `Code.gs`, then paste in the contents of [`Code.gs`](Code.gs) from this repository.
4. **Add the page.** Click the **+** next to "Files", choose **HTML**, and name it `Index` (exactly that). Delete what's inside, then paste in the contents of [`Index.html`](Index.html).
5. **Save.** Press Ctrl+S (Cmd+S on a Mac).
6. **Publish it as your own private web app.** Click **Deploy → New deployment**. Click the gear icon and choose **Web app**. Set "Execute as" to **Me** and "Who has access" to **Only myself**. Click **Deploy**. When Google asks, allow access. It may show a warning screen. If it does, click **Advanced**, then **Go to (your project)**. This is normal for scripts you make yourself.
7. **Open the link** Google gives you. Bookmark it, or add it to your phone's home screen.
8. **Fill in Settings** the first time. Enter your home and local currency, your pay day, your income, your accounts and your budgets. Then open **Money you have now** and type what's in each account today.

### Optional: turn on the AI features

1. Get a Claude API key from [console.anthropic.com](https://console.anthropic.com). It starts with `sk-ant-`. Claude API use is billed by Anthropic, and checking a month of transactions usually costs a few cents.
2. In the app, open **Settings → Claude AI review**. Paste the key yourself and press **Save key**.

The key is stored in your script's private "Script Properties". It is never put in the sheet or in the code, so it is not copied if you share the sheet. You can remove it at any time in Settings.

## Privacy

- Your transactions and settings live in **your own Google Sheet**. The app is deployed from **your own Google account**. There is no server run by anyone else, no tracking, and no ads.
- When you use the AI features, the transactions being checked, or a summary of your pay cycle, are sent to Anthropic's Claude API using **your** key. Nothing is sent to the author of this project.
- To get the exchange rate, the script asks Wise's public rate page for the current rate. Only the two currency codes are sent.
- With "Who has access: Only myself", only you can open the app. If you share it with a partner, they can add expenses too, and each entry records who added it.

## About the exchange rate

The live rate and the daily rates come from Wise's public rate pages (`wise.com/rates/live` and `wise.com/rates/history`). These are **not an official, supported API**, so Wise could change or remove them at any time. Daily rates go back one year. If they can't be reached, the app uses the live rate, or the backup rate you typed in Settings. The locked rate is Wise's mid-market rate for that day. The rate your bank or card actually charged may differ slightly. Each locked rate is saved in the **Rate** column of your sheet, so you can check or change it.

## Changing the code

The app's code is in [`src/app.js`](src/app.js) and the page layout is in [`src/index.template.html`](src/index.template.html). Google Apps Script can damage some modern JavaScript, so the code is stored inside `Index.html` in an encoded form. After editing, rebuild it with:

```
python3 build.py
```

Then paste the new `Index.html` into your script and make a new version under **Deploy → Manage deployments**.

## Disclaimer

This is a personal budgeting tool, not financial advice. Check important numbers against your bank.

## License

MIT. See [LICENSE](LICENSE).
