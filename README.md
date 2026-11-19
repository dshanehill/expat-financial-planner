# AI Budget Ledger

**A simple, phone-friendly budget and spending ledger, infused with AI.** Upload the statements you download from your bank, credit card or e-wallet, and the ledger reads every transaction for you, adds the new ones and skips the ones you already have. Then **Claude AI reviews every entry to make sure each expense is in the right category.** You don't have to type everything in by hand anymore.

It runs entirely in your own Google account: a Google Sheet holds your data, and a small Google Apps Script turns it into a private web app you can open on any phone or computer.

## What it does

- **AI statement automation.** Upload a PDF or CSV statement from almost any financial institution. The ledger finds the bank, reads each transaction, works out whether it's spending, income or a transfer between your own accounts, sorts it into a category and saves it. There's no copying and pasting.
- **AI category check.** With your own Claude API key, Claude reviews new transactions after every upload, or whenever you press **Review categories with Claude**, and fixes anything in the wrong category. A **Reviewed** column in the sheet shows what has been checked.
- **Your own budget.** Set your income sources, a weekly grocery budget and a monthly budget for each category. The home screen shows green, yellow and red bars and warns you at 80% and when you go over.
- **Two currencies.** Keep your budget in your home currency (for example USD) and record spending in the currency you use day to day (for example EUR or PHP).
- **Quick entry.** Type or dictate something like "taxi 12.50" and the form fills itself in.
- **Debt tracker.** Optional. See how much is left and roughly how many months to go.
- **Cash check.** Shows ATM withdrawals you haven't yet logged spending for.
- **Shared use.** Share the sheet with a partner or family member and you can both add expenses from your own phones. A **Who** column shows who added each one.
- **Accessible.** Large high-contrast text, adjustable text size, dark and light modes, and "Read summary out loud."

## Set it up (about 10 minutes)

1. **Create the sheet.** Go to [sheets.new](https://sheets.new) and name the spreadsheet, for example "My Ledger".
2. **Open Apps Script.** In the sheet, choose **Extensions → Apps Script**.
3. **Add the code.**
   - Replace everything in `Code.gs` with the contents of [`Code.gs`](Code.gs) from this repository.
   - Click **+ → HTML**, name the file `Index` (exactly), and replace its contents with [`Index.html`](Index.html).
   - Press **Save** (⌘S / Ctrl+S).
4. **Run setup once.** Choose the `setup` function at the top and press **Run**. Google asks for permission. Because this is your own personal script, Google shows "Google hasn't verified this app". Choose **Advanced → Go to (your project) → Allow**. The ledger only asks for access to *this one spreadsheet*, your email address (for the "Who" column) and permission to contact the Claude API.
5. **Publish it as a web app.** Choose **Deploy → New deployment → Web app**.
   - **Execute as:** *User accessing the web app*
   - **Who has access:** *Only myself*. If you want to share with someone, choose *Anyone with Google account* and share the spreadsheet with them; anyone the sheet isn't shared with can't see your data.
   - Press **Deploy** and copy the web app link.
6. **Open the link on your phone** and add it to your home screen. In Chrome, tap **⋮ → Add to Home screen**.
7. **Fill in Settings.** The first time it opens, the app shows a short setup screen. Enter your currencies, income, accounts and budgets, then press **Save settings**.

## Turn on the AI review (optional)

1. Create a Claude API key at [console.anthropic.com](https://console.anthropic.com) under **API Keys**. You'll need a small amount of prepaid credit; a review of a few hundred transactions costs a few cents.
2. In the ledger, open **Settings → Claude AI review**, paste the key and press **Save key**. It should say *Key saved and working*.

Your key is stored in your Google script's private properties, never in the spreadsheet, and isn't visible to people you share the sheet with. Don't paste your key into chats, emails or code.

## Uploading statements

On the **Add** screen, scroll to **Upload a statement**, press **Choose File**, then **Save statement**.

- **CSV files** give the most accurate results. Most banks offer them under *Statements*, *Activity* or *Download transactions*.
- **PDF statements** work when they contain real text. Scanned images don't. If the PDF has a password, type it in the password box first.
- Name your accounts in **Settings** the way your banks name themselves (for example "Chase, Revolut, PayPal"), so the ledger can match uploaded statements to the right account automatically.
- Transactions already in the ledger (same account, same amount, within 2 days) are skipped, so uploading the same statement twice is safe.

## Your data and privacy

Everything stays in your own Google account. Nothing is sent anywhere except, when you turn on the AI review, the transaction descriptions and amounts that Claude needs to check categories. They go directly from your Google script to Anthropic's API using your own key.

## Changing the app

The app's code lives in [`src/app.js`](src/app.js). Google's HTML service can damage some modern JavaScript, so `Index.html` carries the code in an encoded form. After editing `src/app.js`, run `python3 build.py` to rebuild `Index.html`, paste it into Apps Script, then use **Deploy → Manage deployments → Edit → New version** so your existing link gets the update.

## License

MIT. See [LICENSE](LICENSE).
