# RClone RC GUI 2 (GuiTwo pour les intimes)
This is 'rclone rc gui' forked to support rclone custom baseurl (ex: /rclone)

- Forked from : https://github.com/retifrav/rclone-rc-web-gui

- Added support for URL subdirectory (rclone rcd ... --rc-baseurl <subdirectory>) :
The subdirectory can be changed to another path by editing js/settings.js (default is "/rclone")
   
- UI Themed, and added some more informations (RunningTime, MediumSpeed, ErrorCount, ...)
    
![rclone-rc-web-gui](/screenshot.png?raw=true)

# rclone rc with reverse proxy
Exemple: to use RClone RC GUI 2 webui behind a reverse proxy with /rclone subdir :
    
- edit js/settings.js :

        var rcloneHost = "https://your.publicadresswebsite.com";
        var rclonePort = "443";
        var rcloneUser = "YOUR-USERNAME";
        var rclonePass = "YOUR-PASSWORD";
        var rcloneDir = "/rclone";

- Setup your reverse proxy (nginx example) :
   
location /rclone/ {
                    proxy_pass http://192.168.1.111:5572/;
}
    
- start rclone with :
   
/usr/bin/rclone rcd --rc-web-gui --rc-web-gui-no-open-browser --rc-user=YOUR-USERNAME --rc-pass=YOUR-PASSWORD --config=/config/rclone.conf --rc-addr=:5572 --rc-serve --rc-allow-origin https://your.publicadresswebsite.com --rc-baseurl rclone --transfers 1 /config/web-ui/
    
    
