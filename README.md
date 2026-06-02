# Goal Striver

Minimal Flask + MongoDB tracker for the Striver A2Z sheet.

## Setup

```powershell
pip install -r requirements.txt
```

Start MongoDB locally at:

```text
mongodb://localhost:27017/
```

The app uses database `striver` and collection `problems`.

## Run

```powershell
python app.py
```

Open:

```text
http://127.0.0.1:5000/
```

Admin page:

```text
http://127.0.0.1:5000/admin
```

On first request, MongoDB is seeded from `data/problems.json` if the collection is empty.

To force reload from the extracted seed file:

```powershell
python import_seed.py
```
