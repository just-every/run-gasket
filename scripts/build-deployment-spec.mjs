import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {deploymentSpec} from './delivery/base/spec.mjs';
import {packagingConfig} from './delivery/base/package.mjs';
import {loadSetupManifest} from './delivery/base/setup-manifest.mjs';
const config=JSON.parse(await readFile(new URL('../packaging.json',import.meta.url),'utf8'));
const {project,workflow,setup}=packagingConfig(config);
const selected=await loadSetupManifest(process.cwd(),setup,config.artifact.specInputs?.mail);
const json=value=>JSON.stringify(value,null,2)+'\n';
const outputs={
 'management/integration/deployment-spec.json':json(await deploymentSpec(process.cwd(),config.artifact.specInputs)),
 'rer-project.json':json(selected?{...project,setup:{path:selected.path,sha256:selected.sha256}}:project),
 '.github/workflows/rer-managed.yml':workflow,
};
for(const [name,bytes]of Object.entries(outputs)){
 const path=new URL('../'+name,import.meta.url);
 if(process.argv.includes('--check')){
  if(await readFile(path,'utf8')!==bytes)throw Error(`${name} is stale; run pnpm delivery:spec after the real build.`);
 }else{
  await mkdir(dirname(path.pathname),{recursive:true});await writeFile(path,bytes);console.log(`Wrote ${name}`);
 }
}
if(process.argv.includes('--check'))console.log('Deployment specification, project setup digest and trusted workflow match the real build and source policy.');
