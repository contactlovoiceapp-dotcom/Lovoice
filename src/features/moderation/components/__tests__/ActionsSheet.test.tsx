/* Unit tests for ActionsSheet: renders title, action rows, and invokes callbacks correctly. */

import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';

import ActionsSheet from '../ActionsSheet';
import { COPY } from '../../../../copy';

const DEFAULT_PROPS = {
  visible: true,
  displayName: 'Sophie',
  onReport: jest.fn(),
  onBlock: jest.fn(),
  onClose: jest.fn(),
};

beforeEach(() => jest.clearAllMocks());

describe('ActionsSheet', () => {
  it('renders the title with the displayName', () => {
    const { getByText } = render(<ActionsSheet {...DEFAULT_PROPS} />);
    expect(getByText(COPY.actionsSheet.title('Sophie'))).toBeTruthy();
  });

  it('renders report and block action rows', () => {
    const { getByText } = render(<ActionsSheet {...DEFAULT_PROPS} />);
    expect(getByText(COPY.actionsSheet.report)).toBeTruthy();
    expect(getByText(COPY.actionsSheet.block)).toBeTruthy();
  });

  it('calls onReport when the report row is tapped', () => {
    const { getByText } = render(<ActionsSheet {...DEFAULT_PROPS} />);
    fireEvent.press(getByText(COPY.actionsSheet.report));
    expect(DEFAULT_PROPS.onReport).toHaveBeenCalledTimes(1);
  });

  it('calls onBlock when the block row is tapped', () => {
    const { getByText } = render(<ActionsSheet {...DEFAULT_PROPS} />);
    fireEvent.press(getByText(COPY.actionsSheet.block));
    expect(DEFAULT_PROPS.onBlock).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when the cancel button is tapped', () => {
    const { getByText } = render(<ActionsSheet {...DEFAULT_PROPS} />);
    fireEvent.press(getByText(COPY.common.cancel));
    expect(DEFAULT_PROPS.onClose).toHaveBeenCalledTimes(1);
  });

  it('renders nothing when visible is false', () => {
    const { queryByText } = render(<ActionsSheet {...DEFAULT_PROPS} visible={false} />);
    expect(queryByText(COPY.actionsSheet.report)).toBeNull();
  });
});
