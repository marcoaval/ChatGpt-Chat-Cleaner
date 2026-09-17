# ChatGPT Chat Cleaner

This is a Tampermonkey script I made to help clean up ChatGPT chats faster.

I had a lot of random chats mixed in with school, coding, and other important stuff, so I wanted something that could help me find the chats I probably do not need anymore without deleting everything automatically.

The script looks through the chats currently loaded in the ChatGPT sidebar and checks the titles for certain keywords. It then gives you a list so you can review everything before deleting anything.

## What it does

* Adds a **Clean Recents** button to ChatGPT
* Looks through chats currently loaded in the sidebar
* Tries to find personal or random chats using keywords
* Tries to protect school, coding, cybersecurity, and project chats
* Lets you review everything before deleting
* Lets you select and unselect chats yourself
* Makes you confirm before anything gets deleted
* Only deletes the chats you selected

## Why I made it

I use ChatGPT for a lot of different things including school, coding, cybersecurity, random questions, and personal stuff.

After a while my sidebar gets really cluttered and it gets annoying trying to go through every chat one by one.

I made this so I could clean out some of the random chats while still being careful not to delete school work or projects I want to keep.

## Installation

You need the Tampermonkey extension installed in your browser.

After that:

1. Open Tampermonkey
2. Create a new script
3. Copy the contents of `chatgpt_personal_chat_cleaner.user.js`
4. Paste it into Tampermonkey
5. Save the script
6. Refresh ChatGPT

You should see a **Clean Recents** button in the bottom right.

## How to use it

Open ChatGPT and make sure your chat sidebar is open.

Click:

**🧹 Clean Recents**

The script will scan the chats it can currently see.

It will show you which chats it thinks might be personal and which ones it thinks should be protected.

You can change the selections yourself before deleting anything.

Once you are sure, click **Delete selected** and confirm.

## Keywords

The script uses keyword lists to decide what chats might be personal.

For example:

```javascript
const PERSONAL_KEYWORDS = [
  'health',
  'doctor',
  'family',
  'cat',
  'job'
];
```

There is also a protected keyword list for stuff I usually do not want automatically selected.

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

You can edit these lists in the script depending on what you want it to look for.

## Important

The script does not actually understand what a chat means. It mainly looks at the title and checks for keywords.

Because of that, always check the list before deleting anything.

Once a chat is deleted, this script cannot bring it back.

## Limitations

Right now it only scans chats that are loaded in the ChatGPT sidebar.

If ChatGPT changes its website layout in the future, parts of the script may stop working and need to be updated.

## Privacy

The script runs in your browser through Tampermonkey.

It does not send your chat titles to another server.

## Version

1.0.0

## Disclaimer

This is just a personal project I made for myself and decided to put on GitHub.

It is not made or supported by OpenAI.
