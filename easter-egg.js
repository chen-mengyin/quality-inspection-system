(function () {
  'use strict';

  var proof = Object.freeze({
    id: 'zhc-2026.8.2',
    project: '质检云',
    file: new URL('proof.json', document.baseURI).href
  });

  console.groupCollapsed(
    '%c 质检云 %c 作者专留',
    'background:#1859c9;color:#fff;padding:5px 9px;border-radius:6px;font-weight:700;',
    'color:#1859c9;font-weight:700;'
  );

  console.log(
    '%c这就是一个隐藏入口。',
    'color:#526075;line-height:1.8;'
  );

  console.log('Proof ID：', proof.id);
  console.log('项目名称：', proof.project);
  console.log('验证文件：', proof.file);
  console.log('个人vibe coding成果，zhc。');

  console.groupEnd();

  Object.defineProperty(window, '__SLQC_PROOF__', {
    value: proof,
    enumerable: false,
    writable: false,
    configurable: false
  });
}());
