$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Speech
$synth=New-Object System.Speech.Synthesis.SpeechSynthesizer
$memory=New-Object System.IO.MemoryStream
try {
 $text=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String([Console]::In.ReadToEnd()))
 $voice=$synth.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -eq 'zh-TW' } | Select-Object -First 1
 if (-not $voice) { throw '請先安裝 Windows 繁體中文語音套件' }
 $synth.SelectVoice($voice.VoiceInfo.Name)
 $synth.SetOutputToWaveStream($memory)
 $synth.Speak($text)
 $synth.SetOutputToNull()
 $bytes=$memory.ToArray()
 $output=[Console]::OpenStandardOutput()
 $output.Write($bytes,0,$bytes.Length)
 $output.Flush()
} finally { $synth.Dispose(); $memory.Dispose() }
