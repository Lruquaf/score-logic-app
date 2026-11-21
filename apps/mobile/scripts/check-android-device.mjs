import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || join(homedir(), 'Library', 'Android', 'sdk')
const blockers = [], command = (file, args) => spawnSync(file, args, { encoding: 'utf8', timeout: 15_000 })
const platforms = existsSync(join(sdk, 'platforms')) ? readdirSync(join(sdk, 'platforms')) : []
const platform37 = platforms.some(name => {
  const properties = join(sdk, 'platforms', name, 'source.properties')
  if (!existsSync(properties) || !existsSync(join(sdk, 'platforms', name, 'android.jar'))) return false
  const content = readFileSync(properties, 'utf8')
  return /^AndroidVersion.ApiLevel=37(?:\.0)?\s*$/m.test(content) && !/^AndroidVersion.CodeName=\S+/m.test(content)
})
const commandLineTools = existsSync(join(sdk, 'cmdline-tools')) && readdirSync(join(sdk, 'cmdline-tools')).some(name => existsSync(join(sdk, 'cmdline-tools', name, 'bin', 'sdkmanager')))
const result = { node: process.versions.node, nodeSupported: Number(process.versions.node.split('.')[0]) === 22 && Number(process.versions.node.split('.')[1]) >= 13, sdkPresent: existsSync(sdk), platform37, buildTools37: existsSync(join(sdk, 'build-tools', '37.0.0')), commandLineTools, ndk271: existsSync(join(sdk, 'ndk', '27.1.12297006')), cmake322: existsSync(join(sdk, 'cmake', '3.22.1')), jdk17: false, devices: [], authorizedPhysicalDevices: 0 }
if (!result.nodeSupported) blockers.push('Use the selected Node 22.13+ (22.x) toolchain.')
if (!result.sdkPresent) blockers.push('Install Android Studio and complete its Standard setup.')
if (!result.platform37 || !result.buildTools37 || !result.commandLineTools) blockers.push('SDK Manager: install Android SDK Platform 37, Build-Tools 37.0.0 and Command-line Tools (latest).')
if (!result.ndk271 || !result.cmake322) blockers.push('SDK Manager: install NDK (Side by side) 27.1.12297006 and CMake 3.22.1; enable Show Package Details.')
const jdk = process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', 'java') : 'java'
const java = command(jdk, ['-version'])
result.jdk17 = /version "17(?:\.|\")/.test(String(java.stderr) + String(java.stdout))
if (!result.jdk17) blockers.push('Select the project JDK 17 toolchain before compiling. The current default Java is not JDK 17.')
const adb = join(sdk, 'platform-tools', 'adb')
if (!existsSync(adb)) blockers.push('SDK Manager: install Android SDK Platform-Tools.')
else {
  const list = command(adb, ['devices'])
  if (list.status !== 0) blockers.push('ADB could not start. Open Android Studio and retry.')
  else {
    const devices = list.stdout.split(/\r?\n/).slice(1).filter(line => line.trim()).map(line => { const [serial, state] = line.trim().split(/\s+/); return { serial, state } })
    result.devices = devices.map(({ state }) => ({ state })) // Never print stable device serials.
    const physical = devices.filter(device => device.state === 'device' && !device.serial.startsWith('emulator-'))
    result.authorizedPhysicalDevices = physical.length
    if (devices.some(device => device.state === 'unauthorized')) blockers.push('Unlock the phone and accept the USB debugging authorization prompt.')
    if (physical.length !== 1) blockers.push('Connect exactly one authorized physical Android test phone with a data-capable USB cable.')
    else {
      const get = property => command(adb, ['-s', physical[0].serial, 'shell', 'getprop', property]).stdout.trim()
      result.device = { model: get('ro.product.model'), android: get('ro.build.version.release'), apiLevel: Number(get('ro.build.version.sdk')) }
      if (result.device.apiLevel < 24) blockers.push('The selected app requires Android API 24 or newer.')
    }
  }
}
console.log(JSON.stringify({ ...result, blockers }, null, 2))
if (blockers.length) process.exitCode = 1
