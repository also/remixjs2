STATIC_HTML = FileList.new('html/*.html')
STATIC_JS = FileList.new('js/*.js')
STATIC_CSS = FileList.new('css/*.css')

ALL = STATIC_HTML + STATIC_JS + STATIC_CSS

file 'dist/site' => ALL do
  sh 'mkdir -p dist/site'
  sh 'mkdir -p dist/site/lib'
  sh 'mkdir -p dist/site/js'
  sh 'mkdir -p dist/site/css'
  sh 'cp html/*.html dist/site'
  sh 'cp js/* nest.js remix.js lib/jslint/fulljslint.js lib/js-audio-segments/audio.js dist/site/js'
  sh 'cp css/* dist/site/css'
  sh 'mkdir -p dist/site/lib/codemirror'
  sh 'cp -r lib/codemirror/{js,css} dist/site/lib/codemirror'
  sh 'cp underscore-min.js dist/site/lib'
end

task :clean do
  sh 'rm -rf dist'
end

task :default => ['dist/site']
