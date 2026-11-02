"""Link only the existing eliguli Vercel project; never create a replacement."""
import json
import os
from pathlib import Path
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

token = os.environ.get('VERCEL_TOKEN')
if not token:
    raise SystemExit('VERCEL_TOKEN is unavailable; configure it securely in repository Actions secrets.')
query = {}
team = os.environ.get('VERCEL_ORG_ID', '')
if team.startswith('team_'):
    query['teamId'] = team
url = 'https://api.vercel.com/v9/projects/eliguli'
if query:
    url += '?' + urlencode(query)
try:
    with urlopen(Request(url, headers={'Authorization': 'Bearer ' + token}), timeout=30) as response:
        project = json.load(response)
except HTTPError as error:
    raise SystemExit(f'Existing Vercel project lookup failed with HTTP {error.code}; check token access and scope.')
if project.get('name') != 'eliguli' or not project.get('id') or not project.get('accountId'):
    raise SystemExit('The existing Vercel project identity could not be verified.')
directory = Path('.vercel')
directory.mkdir(exist_ok=True)
(directory / 'project.json').write_text(json.dumps({'projectId': project['id'], 'orgId': project['accountId'], 'projectName': 'eliguli'}))
print('Linked the existing eliguli Vercel project.')
