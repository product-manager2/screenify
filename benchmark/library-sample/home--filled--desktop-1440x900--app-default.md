---
kind: screen
screen: home
state: filled
title: Memos
image: home--filled--desktop-1440x900--app-default.png
platform: web
feature: timeline
viewport: desktop-1440x900
theme: app-default
shows: "Home timeline, signed in as screenify: composer at the top, five memos below (newest Draft and dentist; Packing list shows its task lines as plain text, not checkboxes; Reading list tagged books)"
route: /
url: http://localhost:5231/
recipe: recipes/web/timeline/home.json
commit: b40d8a7b573774c52b022c8d6537d6baf2129dc0
branch: null
dirty: true
captured_at: 2026-11-14T11:02:17.882Z
sources:
  - web/src/components/MemoDisplaySettingMenu.tsx
  - web/src/components/MemoFilters.tsx
  - web/src/components/PagedMemoList/PagedMemoList.tsx
  - web/src/pages/Home.tsx
---

# timeline / home — filled (desktop-1440x900, app-default)

Shows: Home timeline, signed in as screenify: composer at the top, five memos below (newest Draft and dentist; Packing list shows its task lines as plain text, not checkboxes; Reading list tagged books)

## Visible text

```text
screenify
Timeline
Calendar
Map
Attachments
Search
November 2026
S
M
T
W
T
F
S
1
2
3
4
5
6
7
8
9
10
11
12
13
14
15
16
17
18
19
20
21
22
23
24
25
26
27
28
29
30
1
2
3
4
5
VIEWS
Create view
TAGS
books
1
personal
1
project
1
Memos demo
Feel free to explore! This demo is reset periodically.
Deploy your own Memos

Private
Save

Draft: notes from the design review #project

Call the dentist on Monday morning

Welcome note: this is my space for quick thoughts #personal

Packing list for the coast trip
- [ ] Passport
- [ ] Charger
- [x] Offline maps

Reading list for November #books
- Piranesi
- The Overstory
```

## Accessibility outline

```yaml
- complementary:
  - 'button "Switch space: screenify"': screenify
  - button "New memo"
  - navigation "Primary":
    - link "Timeline":
      - /url: /
    - button "Timeline · View options"
    - link "Calendar":
      - /url: /calendar?[redacted]
    - link "Map":
      - /url: /map?[redacted]
    - link "Attachments":
      - /url: /attachments?[redacted]
    - button "Search"
  - region "Statistics":
    - heading "November 2026" [level=2]
    - navigation "Month navigation":
      - button "Previous month"
      - button "Next month"
    - group "Calendar for 2026-11":
      - button "2026-11-01": "1"
      - button "2026-11-02": "2"
      - button "2026-11-03": "3"
      - button "2026-11-04": "4"
      - button "2026-11-05": "5"
      - button "2026-11-06": "6"
      - button "2026-11-07": "7"
      - button "2026-11-08": "8"
      - button "2026-11-09": "9"
      - button "2026-11-10": "10"
      - button "2026-11-11": "11"
      - button "2026-11-12": "12"
      - button "2026-11-13": "13"
      - button "5 memos in 2026-11-14": "14"
      - button "2026-11-15": "15"
      - button "2026-11-16": "16"
      - button "2026-11-17": "17"
      - button "2026-11-18": "18"
      - button "2026-11-19": "19"
      - button "2026-11-20": "20"
      - button "2026-11-21": "21"
      - button "2026-11-22": "22"
      - button "2026-11-23": "23"
      - button "2026-11-24": "24"
      - button "2026-11-25": "25"
      - button "2026-11-26": "26"
      - button "2026-11-27": "27"
      - button "2026-11-28": "28"
      - button "2026-11-29": "29"
      - button "2026-11-30": "30"
      - text: 1 2 3 4 5
  - heading "Views" [level=2]
  - button "Create view"
  - heading "Tags" [level=2]
  - 'button "Tags: More"'
  - button "#books, 1 memos": books 1
  - button "#personal, 1 memos": personal 1
  - button "#project, 1 memos": project 1
- separator "Resize sidebar"
- main:
  - text: Memos demo Feel free to explore! This demo is reset periodically.
  - link "Deploy your own Memos":
    - /url: https://usememos.com/docs/deploy
  - textbox:
    - paragraph: Any thoughts...
  - button "Add"
  - button "Private"
  - button "Save" [disabled]
  - article:
    - link "1 minute ago":
      - /url: /memos/iLxK5sPvqpXwoxevccQeaS
    - button "More"
    - textbox:
      - paragraph: "Draft: notes from the design review #project"
  - article:
    - link "1 minute ago":
      - /url: /memos/3xXvXMWKDU9adb3gE3gQZe
    - button "More"
    - textbox:
      - paragraph: Call the dentist on Monday morning
  - article:
    - link "1 minute ago":
      - /url: /memos/ZRYhYBCKvSqws42ocamnGR
    - button "More"
    - textbox:
      - paragraph: "Welcome note: this is my space for quick thoughts #personal"
  - article:
    - link "2 minutes ago":
      - /url: /memos/bQNtv8SVVMFJrJTyNoyWHx
    - button "More"
    - textbox:
      - paragraph: Packing list for the coast trip - [ ] Passport - [ ] Charger - [x] Offline maps
  - article:
    - link "2 minutes ago":
      - /url: /memos/a95xNgQprxKb7LokR77ysP
    - button "More"
    - textbox:
      - paragraph: "Reading list for November #books - Piranesi - The Overstory"
```
