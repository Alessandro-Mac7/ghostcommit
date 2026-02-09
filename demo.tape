# ghostcommit demo
# Run: bash demo-setup.sh && GROQ_API_KEY=... vhs demo.tape

Output demo.gif

Set Shell "bash"
Set FontSize 16
Set Width 900
Set Height 520
Set Theme "Catppuccin Mocha"
Set Padding 24
Set TypingSpeed 40ms
Set CursorBlink false
Set WindowBar Colorful
Set BorderRadius 8
Set Framerate 24

Hide
Type `source ~/.zshrc 2>/dev/null; source ~/.bashrc 2>/dev/null; source ~/.nvm/nvm.sh 2>/dev/null; export PATH="$HOME/.nvm/versions/node/v24.13.0/bin:$PATH"`
Enter
Sleep 1s
Type "cd /tmp/ghostcommit-demo && clear"
Enter
Sleep 1500ms
Show

Sleep 800ms

Type "git diff --staged --stat"
Enter
Sleep 3s

Type `ghostcommit --context "added JWT auth with refresh token rotation" --yes`
Enter
Sleep 8s

Type "git log --oneline -1"
Enter
Sleep 4s

Sleep 2s
