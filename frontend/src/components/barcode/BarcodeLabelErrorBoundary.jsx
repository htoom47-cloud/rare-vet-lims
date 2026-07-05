import { Component } from 'react';
import { withTranslation } from 'react-i18next';

class BarcodeLabelErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    // eslint-disable-next-line no-console
    console.error('[BarcodeLabel]', error);
  }

  render() {
    const { hasError } = this.state;
    const { children, t } = this.props;
    if (hasError) {
      return (
        <div className="label-preview label-50x25 bg-white text-red-600 p-2 text-center text-xs">
          {t('samples.barcodeLabelBuildFailed')}
        </div>
      );
    }
    return children;
  }
}

export default withTranslation()(BarcodeLabelErrorBoundary);
