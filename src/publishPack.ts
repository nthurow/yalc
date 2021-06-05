import { exec, execSync } from 'child_process'
import { join } from 'path'

import {
  execLoudOptions,
  getPackageManager,
  getStorePackagesDir,
  PackageManifest,
  PackageScripts,
  readPackageManifest,
  updatePackages,
  values,
} from '.'
import { copyPackageToStore } from './copyPack'
import {
  PackageInstallation,
  readInstallationsFile,
  removeInstallations,
} from './installations'
import { pmRunScriptCmd } from './pm'

export interface PublishPackageOptions {
  workingDir: string
  signature?: boolean
  changed?: boolean
  push?: boolean
  update?: boolean
  replace?: boolean
  npm?: boolean
  files?: boolean
  private?: boolean
  scripts?: boolean
  devMod?: boolean
  workspaceResolve?: boolean
}

export const publishPackagePack = async (options: PublishPackageOptions) => {
  const workingDir = options.workingDir
  const pkg = readPackageManifest(workingDir)
  if (!pkg) {
    return
  }

  // TODO: Bug? Will anything but NPM be chosen in a workspace project?
  // const pm = getPackageManager(workingDir)
  const pm = 'yarn'
  console.log('pm:', pm)

  const runPmScript = (script: keyof PackageScripts | 'pack') => {
    if (!options.scripts) return
    const scriptCmd = script !== 'pack' ? pkg.scripts?.[script] : 'pack'
    if (scriptCmd) {
      console.log(`Running ${script} script: ${scriptCmd}`)
      execSync(`${pmRunScriptCmd[pm]} ${script}`, {
        cwd: workingDir,
        ...execLoudOptions,
      })
    }
  }

  if (pkg.private && !options.private) {
    console.log(
      'Will not publish package with `private: true`' +
        ' use --private flag to force publishing.'
    )
    return
  }

  // Consider not running these scripts, since they should get run by "pack"?
  const preScripts: (keyof PackageScripts)[] = ['preyalcpublish']
  preScripts.forEach(runPmScript)

  runPmScript('pack')

  const copyRes = await copyPackageToStore(options)

  if (options.changed && !copyRes) {
    console.warn('Package content has not changed, skipping publishing.')
    return
  }

  // Consider not running these scripts, since they should get run by "pack"?
  const postScripts: (keyof PackageScripts)[] = ['postyalcpublish']
  postScripts.forEach(runPmScript)

  const publishedPackageDir = join(getStorePackagesDir(), pkg.name, pkg.version)
  const publishedPkg = readPackageManifest(publishedPackageDir)!
  console.log(
    `${publishedPkg.name}@${publishedPkg.version} published in store.`
  )

  if (options.push) {
    const installationsConfig = readInstallationsFile()
    const installationPaths = installationsConfig[pkg.name] || []
    const installationsToRemove: PackageInstallation[] = []
    for (const workingDir of installationPaths) {
      console.info(`Pushing ${pkg.name}@${pkg.version} in ${workingDir}`)
      const installationsToRemoveForPkg = await updatePackages([pkg.name], {
        replace: options.replace,
        workingDir,
        update: options.update,
        noInstallationsRemove: true,
      })
      installationsToRemove.push(...installationsToRemoveForPkg)
    }
    await removeInstallations(installationsToRemove)
  }
}
