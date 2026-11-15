# TriageTime

Hospital waiting times across Australia. Free, open data.

## Data Sources
- [QLD Live ED](https://publicdata.au/d/qld-emergency-department-waits-now/) — CC BY 4.0
- [AU ED Time in ED](https://publicdata.au/d/au-ed-time-in-ed/) — CC BY 4.0
- [AU 4-Hour Rule](https://publicdata.au/d/au-ed-patients-seen-on-time/) — CC BY 4.0
- [AU Elective Surgery](https://publicdata.au/d/au-elective-surgery-waiting-times/) — CC BY 4.0

## How it works
GitHub Actions downloads CSVs daily → Cloudflare Pages builds static HTML → served from CDN.
No database. No server. $0/month.   
