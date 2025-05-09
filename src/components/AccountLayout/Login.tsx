import React from 'react';
import { Button, message } from 'antd';
import { QuestionCircleOutlined } from '@ant-design/icons';
import { backgroundBridge } from '@/core/bridge/background';
import { __i18n } from '@/isomorphic/i18n';
import LinkHelper from '@/isomorphic/link-helper';
import { VERSION } from '@/config';
import YuqueLogo from '@/assets/images/yuque-logo.png';
import Env from '@/isomorphic/env';
import LarkIcon from '../LarkIcon';
import Typography from '../Typography';
import styles from './Login.module.less';

interface ILoginProps {
  forceUpgradeHtml?: string;
  setUser: (user: any) => void;
}

function Login(props: ILoginProps) {
  const { forceUpgradeHtml, setUser } = props;

  const onLogin = async () => {
    const user = await backgroundBridge.user.login();
    setUser(user);
    if (!user) {
      message.error(__i18n('登录失败'));
      return;
    }
  };

  if (forceUpgradeHtml) {
    return (
      <div className={styles.wrapper}>
        <div
          dangerouslySetInnerHTML={{ __html: forceUpgradeHtml }}
          className={styles.content}
        />
      </div>
    );
  }

  return (
    <div className={styles.wrapper}>
      {Env.isRunningHostPage && (
        <Typography
          type="iconButton"
          className={styles.closeWrapper}
          onClick={() => backgroundBridge.sidePanel.close()}
        >
          <LarkIcon name="close-outline" />
        </Typography>
      )}
      <div className={styles.content}>
        <div className={styles.welcome}>
          <img width="60" src={YuqueLogo} alt="yuque logo" />
          <div className={styles.loginTip}>
            {__i18n('欢迎，请点击登录Sadp抽取器账户')}
          </div>
        </div>
        <Button type="primary" block onClick={onLogin} disabled={false}>
          {__i18n('立即登录')}
        </Button>
        <a
          className={styles.question}
          target="_blank"
          rel="noopener noreferrer"
          href={LinkHelper.helpDoc}
        >
          <QuestionCircleOutlined className={styles.icon} />
          {__i18n('问题反馈')}
          {`v1.0.0`}
        </a>
      </div>
    </div>
  );
}

export default React.memo(Login);
