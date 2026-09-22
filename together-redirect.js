(function () {
  'use strict';
  if (!/^\/together(?:\/|$)/.test(location.pathname)) return;
  var appStore = 'https://apps.apple.com/app/sidequest-tiny-adventures/id6781441096';
  var match = /^\/together\/([0-9a-f]{48})\/?$/i.exec(location.pathname);
  // Do not retain invitation credentials in browser storage, analytics or referrers.
  var destination = appStore;
  if (match) {
    var token = match[1].toLowerCase();
    var link = new URL('https://ohsidequest.onelink.me/qsfq/');
    link.searchParams.set('pid', 'User_invite');
    link.searchParams.set('c', 'together');
    link.searchParams.set('deep_link_value', 'together');
    link.searchParams.set('deep_link_sub1', token);
    link.searchParams.set('af_dp', 'sidequest://together/' + token);
    link.searchParams.set('af_ios_url', appStore);
    link.searchParams.set('af_web_dp', appStore);
    destination = link.toString();
  }
  history.replaceState(null, '', '/together/');
  location.replace(destination);
}());
