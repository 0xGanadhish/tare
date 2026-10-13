# Verifies every CREATE in a forge broadcast file on MonadVision + Monadscan via the devnads API.
# Usage (from contracts/): python3 script/verify.py <chainId> broadcast/<Script>/<chainId>/run-latest.json out

import json, subprocess, sys, urllib.request, os
chain = int(sys.argv[1]); run = sys.argv[2]; out_dir = sys.argv[3]
SRC = {'MockToken':'src/MockToken.sol','MirrorVault':'src/MirrorVault.sol','Guardian':'src/Guardian.sol','LaunchFactory':'src/LaunchFactory.sol','CurveToken':'src/CurveToken.sol','TareRiskOracle':'src/TareRiskOracle.sol','GuardianV2':'src/GuardianV2.sol','MirrorAdapter':'src/adapters/MirrorAdapter.sol','EulerAdapter':'src/adapters/EulerAdapter.sol'}
txs = [t for t in json.load(open(run))['transactions'] if t['transactionType'] == 'CREATE']
for t in txs:
    name, addr = t['contractName'], t['contractAddress']
    art = json.load(open(f'out/{os.path.basename(SRC[name])}/{name}.json'))
    code = art['bytecode']['object'].removeprefix('0x')
    inp = t['transaction']['input'].removeprefix('0x')
    args = inp[len(code):] if inp.startswith(code) else ''
    meta = art['metadata'] if isinstance(art['metadata'], dict) else json.loads(art['rawMetadata'])
    ver = 'v' + meta['compiler']['version']
    std = json.loads(subprocess.run(['forge','verify-contract',addr,f'{SRC[name]}:{name}','--chain',str(chain),'--show-standard-json-input'],capture_output=True,text=True).stdout)
    body = {'chainId':chain,'contractAddress':addr,'contractName':f'{SRC[name]}:{name}','compilerVersion':ver,'standardJsonInput':std,'foundryMetadata':meta}
    if args: body['constructorArgs'] = args
    req = urllib.request.Request('https://agents.devnads.com/v1/verify', data=json.dumps(body).encode(), headers={'content-type':'application/json'})
    try:
        r = urllib.request.urlopen(req, timeout=120).read().decode()
    except urllib.error.HTTPError as e:
        r = f'HTTP {e.code} {e.read().decode()[:300]}'
    print(name, addr, r[:300])
