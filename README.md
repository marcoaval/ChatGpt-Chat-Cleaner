# ChatGPT & Claude Chat Cleaner

This is a Tampermonkey script I made to help clean up ChatGPT and Claude chats faster.

I had a lot of random chats mixed in with school, coding, and other important stuff, so I wanted something that could help find chats I probably do not need anymore without deleting everything automatically.

The script looks through conversations currently loaded in the sidebar, checks the titles for certain keywords, and gives you a list to review before anything is deleted.

## Supported sites

- ChatGPT
- Claude

## What it does

- Adds a **Clean Recents** button
- Looks through chats currently loaded in the sidebar
- Tries to find personal or random chats using general keywords
- Tries to protect school, coding, cybersecurity, and project chats
- Lets you review everything before deleting
- Lets you select and unselect chats yourself
- Makes you confirm before anything gets deleted
- Only deletes the chats you selected

## Why I made it

I use AI chat tools for a lot of different things including school, coding, random questions, and personal stuff.

After a while the sidebar gets cluttered and it gets annoying trying to go through every chat one by one.

I made this so I could clean out some of the random chats while still being careful not to delete school work or projects I want to keep.

## Installation

You need the Tampermonkey extension installed in your browser.

After that:

1. Open Tampermonkey
2. Create a new script
3. Copy the contents of `chatgpt_personal_chat_cleaner.user.js`
4. Paste it into Tampermonkey
5. Save the script
6. Refresh ChatGPT or Claude

You should see a **Clean Recents** button in the bottom right.

## How to use it

Open ChatGPT or Claude and make sure the conversation sidebar is open.

Click:

**🧹 Clean Recents**

The script will scan the chats it can currently see.

It will show which chats match personal keywords and which ones match protected keywords.

You can change the selections yourself before deleting anything.

Once you are sure, click **Delete selected** and confirm.

## Keywords

The script uses general keyword lists to decide what chats might be personal.

For example:

```javascript
const PERSONAL_KEYWORDS = [
  'health',
  'relationship',
  'family',
  'pet',
  'job'
];
```

There is also a protected keyword list for chats that should not normally be selected automatically.

For example:

```javascript
const PROTECTED_KEYWORDS = [
  'class',
  'assignment',
  'github',
  'python',
  'cybersecurity'
];
```

These lists can be changed in the script.

## Important

The script does not actually understand what a chat means. It mainly looks at the title and checks for keywords.

Because of that, always check the list before deleting anything.

Once a chat is deleted, this script cannot bring it back.

## Limitations

The script only scans chats that are currently loaded in the sidebar.

ChatGPT or Claude can change their website layouts at any time, which can require the script selectors to be updated.

## Privacy

The script runs locally in the browser through Tampermonkey.

It does not send chat titles to another server.

## Version

1.1.0

## Commercial Use

This project is free to use for personal, educational, research, and other non-commercial purposes.

If you want to use this project in a paid product, service, business, monetized project, or anything else that makes money, you need my permission first.

Commercial licensing, royalties, or revenue-sharing terms would be handled separately in writing.

See the `LICENSE` file for the full terms.

## Disclaimer

This is a personal project and is not made, supported, or endorsed by OpenAI or Anthropic.
